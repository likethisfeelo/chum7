import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

type CheerItem = {
  cheerId: string;
  senderId: string;
  receiverId: string;
  challengeId?: string;
  cheerType?: 'immediate' | 'scheduled' | string;
  isThanked?: boolean;
  replyMessage?: string | null;
  reactionType?: string | null;
  createdAt?: string;
  sentAt?: string;
};

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
}

function isValidDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidMonthInput(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function isValidWeekInput(value: string): boolean {
  return /^\d{4}-W\d{2}$/.test(value);
}

function toIsoRange(period: string, day?: string, week?: string, month?: string): { start?: string; end?: string; label: string } {
  if (period === 'day') {
    const input = day && isValidDateInput(day) ? day : new Date().toISOString().slice(0, 10);
    const start = `${input}T00:00:00.000Z`;
    const end = `${input}T23:59:59.999Z`;
    return { start, end, label: input };
  }

  if (period === 'month') {
    const input = month && isValidMonthInput(month) ? month : new Date().toISOString().slice(0, 7);
    const [year, monthPart] = input.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, monthPart - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, monthPart, 0, 23, 59, 59, 999));
    return { start: startDate.toISOString(), end: endDate.toISOString(), label: input };
  }

  if (period === 'week') {
    const now = new Date();
    const fallbackIsoWeek = (() => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    })();

    const weekInput = week && isValidWeekInput(week) ? week : fallbackIsoWeek;
    const [yearText, weekText] = weekInput.split('-W');
    const year = Number(yearText);
    const weekNo = Number(weekText);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
    const startDate = new Date(mondayWeek1);
    startDate.setUTCDate(mondayWeek1.getUTCDate() + (weekNo - 1) * 7);
    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);

    return { start: startDate.toISOString(), end: endDate.toISOString(), label: weekInput };
  }

  return { label: 'all' };
}

function resolveTimestamp(item: CheerItem): string {
  return item.sentAt || item.createdAt || '';
}

function inRange(item: CheerItem, start?: string, end?: string): boolean {
  if (!start || !end) return true;
  const ts = resolveTimestamp(item);
  if (!ts) return false;
  return ts >= start && ts <= end;
}

async function collectByIndex(indexName: string, keyExpression: string, expressionAttributeValues: Record<string, unknown>): Promise<CheerItem[]> {
  const result: CheerItem[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const query = await docClient.send(new QueryCommand({
      TableName: process.env.CHEERS_TABLE!,
      IndexName: indexName,
      KeyConditionExpression: keyExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExclusiveStartKey: lastEvaluatedKey,
      ScanIndexForward: false
    }));

    result.push(...((query.Items || []) as CheerItem[]));
    lastEvaluatedKey = query.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return result;
}

async function validateChallengeAccess(userId: string, challengeId: string): Promise<{ ok: boolean; statusCode?: number; error?: string; message?: string }> {
  const challenge = await docClient.send(new GetCommand({
    TableName: process.env.CHALLENGES_TABLE!,
    Key: { challengeId }
  }));

  if (!challenge.Item) {
    return {
      ok: false,
      statusCode: 404,
      error: 'CHALLENGE_NOT_FOUND',
      message: '챌린지를 찾을 수 없습니다'
    };
  }

  const participants = await docClient.send(new QueryCommand({
    TableName: process.env.USER_CHALLENGES_TABLE!,
    IndexName: 'challengeId-index',
    KeyConditionExpression: 'challengeId = :challengeId',
    ExpressionAttributeValues: {
      ':challengeId': challengeId
    },
    Limit: 200
  }));

  const isParticipant = (participants.Items || []).some((item: any) => item.userId === userId);
  if (!isParticipant) {
    return {
      ok: false,
      statusCode: 403,
      error: 'CHALLENGE_ACCESS_DENIED',
      message: '해당 챌린지 통계를 조회할 권한이 없습니다'
    };
  }

  return { ok: true };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const params = event.queryStringParameters || {};
    const period = (params.period || 'all').trim().toLowerCase();
    const challengeId = params.challengeId?.trim();

    if (period === 'challenge' && !challengeId) {
      return response(400, { error: 'MISSING_CHALLENGE_ID', message: 'period=challenge 인 경우 challengeId가 필요합니다' });
    }

    if (period === 'challenge' && challengeId) {
      const challengeValidation = await validateChallengeAccess(userId, challengeId);
      if (!challengeValidation.ok) {
        return response(challengeValidation.statusCode || 400, {
          error: challengeValidation.error,
          message: challengeValidation.message
        });
      }
    }

    const { start, end, label } = toIsoRange(period, params.day?.trim(), params.week?.trim(), params.month?.trim());

    const [sentRaw, receivedRaw] = await Promise.all([
      collectByIndex('senderId-index', 'senderId = :senderId', { ':senderId': userId }),
      collectByIndex('receiverId-index', 'receiverId = :receiverId', { ':receiverId': userId })
    ]);

    const applyFilters = (items: CheerItem[]) => items.filter((item) => {
      if (!inRange(item, start, end)) return false;
      if (period === 'challenge') return item.challengeId === challengeId;
      if (period === 'all') return true;
      return true;
    });

    const sent = applyFilters(sentRaw);
    const received = applyFilters(receivedRaw);

    const stats = {
      sentCount: sent.length,
      receivedCount: received.length,
      thankedCount: received.filter((item) => item.isThanked).length,
      immediateCount: [...sent, ...received].filter((item) => item.cheerType === 'immediate').length,
      scheduledCount: [...sent, ...received].filter((item) => item.cheerType === 'scheduled').length,
      repliedCount: received.filter((item) => Boolean(item.replyMessage)).length,
      reactionCount: received.filter((item) => Boolean(item.reactionType)).length
    };

    return response(200, {
      success: true,
      data: {
        period,
        label,
        challengeId: period === 'challenge' ? challengeId : null,
        range: { start: start ?? null, end: end ?? null },
        stats
      }
    });
  } catch (error) {
    console.error('Get cheer stats error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
