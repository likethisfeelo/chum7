import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

type VerificationItem = Record<string, any>;

type ListMode = 'scan' | 'mine' | 'public';

type ParsedNextToken = {
  mode: ListMode;
  startKey: Record<string, any>;
};

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

function isPublicVerification(v: VerificationItem): boolean {
  const isPublic = v.isPublic === 'true' || v.isPublic === true;
  const isPersonalOnly = v.isPersonalOnly === true;
  return isPublic && !isPersonalOnly;
}

function normalizeVerification(v: VerificationItem) {
  return {
    verificationId: v.verificationId,
    userId: v.userId,
    userName: v.userName || null,
    day: v.day,
    todayNote: v.todayNote,
    imageUrl: v.imageUrl || null,
    isAnonymous: Boolean(v.isAnonymous),
    isExtra: Boolean(v.isExtra),
    isPersonalOnly: Boolean(v.isPersonalOnly),
    cheerCount: v.cheerCount || 0,
    createdAt: v.createdAt,
    certDate: v.certDate || v.verificationDate || null,
    scoreEarned: v.scoreEarned ?? v.score ?? 0,
  };
}

function parseNextToken(nextToken?: string): ParsedNextToken | null {
  if (!nextToken) return null;

  try {
    const decoded = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
    if (!decoded || typeof decoded !== 'object' || !decoded.mode || !decoded.startKey) {
      throw new Error('INVALID_NEXT_TOKEN');
    }

    return {
      mode: decoded.mode,
      startKey: decoded.startKey,
    } as ParsedNextToken;
  } catch {
    throw new Error('INVALID_NEXT_TOKEN');
  }
}

function toNextToken(mode: ListMode, startKey?: Record<string, any>) {
  if (!startKey) return null;
  return Buffer.from(JSON.stringify({ mode, startKey }), 'utf-8').toString('base64');
}

function matchesExtraFilter(v: VerificationItem, isExtra?: string) {
  if (isExtra === 'true' && !v.isExtra) return false;
  if (isExtra === 'false' && v.isExtra) return false;
  return true;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;

    const query = event.queryStringParameters || {};
    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
    const isPublic = query.isPublic === 'true';
    const mine = query.mine === 'true';
    const isExtra = query.isExtra;

    let parsedNextToken: ParsedNextToken | null = null;
    try {
      parsedNextToken = parseNextToken(query.nextToken);
    } catch {
      return response(400, {
        error: 'INVALID_NEXT_TOKEN',
        message: 'nextToken 형식이 올바르지 않습니다',
      });
    }

    if (mine && !userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: 'mine=true 조회는 인증이 필요합니다',
      });
    }

    const mode: ListMode = mine ? 'mine' : isPublic ? 'public' : 'scan';
    if (parsedNextToken && parsedNextToken.mode !== mode) {
      return response(400, {
        error: 'INVALID_NEXT_TOKEN',
        message: 'nextToken이 현재 조회 조건과 일치하지 않습니다',
      });
    }

    let items: VerificationItem[] = [];
    let nextToken: string | null = null;

    if (mode === 'mine') {
      const result = await docClient.send(
        new QueryCommand({
          TableName: process.env.VERIFICATIONS_TABLE!,
          IndexName: 'userId-index',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': userId,
          },
          ScanIndexForward: false,
          Limit: Math.max(limit * 2, 40),
          ExclusiveStartKey: parsedNextToken?.startKey,
        }),
      );

      items = (result.Items || []).filter((v) => matchesExtraFilter(v, isExtra));
      items = items.slice(0, limit);
      nextToken = toNextToken(mode, result.LastEvaluatedKey);
    } else if (mode === 'public') {
      let cursor: Record<string, any> | undefined = parsedNextToken?.startKey;
      const merged: VerificationItem[] = [];

      for (let i = 0; i < 5 && merged.length < limit; i += 1) {
        const result = await docClient.send(
          new QueryCommand({
            TableName: process.env.VERIFICATIONS_TABLE!,
            IndexName: 'isPublic-createdAt-index',
            KeyConditionExpression: 'isPublic = :isPublic',
            ExpressionAttributeValues: {
              ':isPublic': 'true',
            },
            ScanIndexForward: false,
            Limit: Math.max(limit * 2, 40),
            ExclusiveStartKey: cursor,
          }),
        );

        const filtered = (result.Items || []).filter((v) => isPublicVerification(v) && matchesExtraFilter(v, isExtra));
        merged.push(...filtered);

        cursor = result.LastEvaluatedKey;
        if (!cursor) break;
      }

      items = merged.slice(0, limit);
      nextToken = toNextToken(mode, cursor);
    } else {
      const result = await docClient.send(
        new ScanCommand({
          TableName: process.env.VERIFICATIONS_TABLE!,
          Limit: 500,
          ExclusiveStartKey: parsedNextToken?.startKey,
        }),
      );

      items = (result.Items || []).filter((v: VerificationItem) => {
        if (isExtra === 'true' && !v.isExtra) return false;
        if (isExtra === 'false' && v.isExtra) return false;
        return true;
      });

      items.sort((a: VerificationItem, b: VerificationItem) => {
        const at = new Date(a.createdAt || 0).getTime();
        const bt = new Date(b.createdAt || 0).getTime();
        return bt - at;
      });

      items = items.slice(0, limit);
      nextToken = toNextToken(mode, result.LastEvaluatedKey);
    }

    return response(200, {
      success: true,
      data: {
        verifications: items.map(normalizeVerification),
        count: items.length,
        nextToken,
      },
    });
  } catch (error: any) {
    console.error('List verification error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다',
    });
  }
};
