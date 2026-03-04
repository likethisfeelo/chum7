/**
 * GET /admin/quests/submissions
 *   ?status=pending          (default: pending)
 *   ?questId=xxx             (특정 퀘스트 필터)
 *   ?challengeId=xxx         (특정 챌린지 필터)
 *   ?questScope=leader|personal|mixed
 *   ?limit=20
 *   ?nextToken=xxx           (pagination)
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function parseGroups(rawGroups: unknown): string[] {
  if (!rawGroups) return [];
  if (Array.isArray(rawGroups)) return rawGroups.map(String).map(g => g.trim()).filter(Boolean);
  if (typeof rawGroups !== 'string') return [];

  const value = rawGroups.trim();
  if (!value) return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).map(g => g.trim()).filter(Boolean);
    } catch {
      // fall through
    }
  }

  return value
    .split(/[,:]/)
    .map(g => g.replace(/[\[\]"']/g, '').trim())
    .filter(Boolean);
}


function extractUploadsKey(url?: string | null): string | null {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;

  if (raw.startsWith('/uploads/')) return raw.slice('/uploads/'.length);
  if (raw.startsWith('uploads/')) return raw.slice('uploads/'.length);

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith('/uploads/')) return parsed.pathname.slice('/uploads/'.length);
    } catch {
      return null;
    }
  }

  if (raw.includes('/') && !raw.startsWith('http')) return raw.replace(/^\/+/, '');
  return null;
}

async function toRenderableMediaUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  const key = extractUploadsKey(url);
  if (!key || !process.env.UPLOADS_BUCKET) return url;

  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: process.env.UPLOADS_BUCKET, Key: key }),
      { expiresIn: 3600 },
    );
  } catch (error) {
    console.error('Failed to sign quest submission media url:', error);
    return url;
  }
}

function canAccess(event: APIGatewayProxyEvent): boolean {
  const groups = parseGroups(event.requestContext.authorizer?.jwt?.claims['cognito:groups']);
  const allowed = new Set(['admins', 'productowners', 'leaders', 'managers']);
  return groups.some(group => allowed.has(group));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!canAccess(event)) {
      return response(403, { error: 'FORBIDDEN', message: '제출물 조회 권한이 필요합니다' });
    }

    const params = event.queryStringParameters || {};
    const status = params.status || 'pending';
    const questId = params.questId;
    const challengeId = params.challengeId;
    const questScope = params.questScope;
    const limit = Math.min(Number(params.limit) || 20, 100);
    const nextToken = params.nextToken
      ? JSON.parse(Buffer.from(params.nextToken, 'base64').toString())
      : undefined;

    let submissions: any[] = [];
    let lastEvaluatedKey: any = undefined;

    if (status === 'all' && !questId) {
      const allStatuses = ['pending', 'approved', 'auto_approved', 'rejected'];
      const pages = await Promise.all(allStatuses.map((eachStatus) => {
        const expressionNames: Record<string, string> = { '#status': 'status' };
        const expressionValues: Record<string, any> = { ':status': eachStatus };
        let filterExpression: string | undefined = undefined;

        if (challengeId) {
          filterExpression = 'challengeId = :challengeId';
          expressionValues[':challengeId'] = challengeId;
        }

        return docClient.send(new QueryCommand({
          TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
          IndexName: 'status-createdAt-index',
          KeyConditionExpression: '#status = :status',
          ...(filterExpression ? { FilterExpression: filterExpression } : {}),
          ExpressionAttributeNames: expressionNames,
          ExpressionAttributeValues: expressionValues,
          ScanIndexForward: false,
          Limit: limit,
        }));
      }));

      submissions = pages
        .flatMap((result) => result.Items ?? [])
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, limit);
      lastEvaluatedKey = undefined;
    } else if (questId) {
      const expressionNames: Record<string, string> = { '#status': 'status' };
      const expressionValues: Record<string, any> = { ':qid': questId, ':status': status };
      let filterExpression = status === 'all' ? 'attribute_exists(submissionId)' : '#status = :status';

      if (status === 'all') {
        delete expressionValues[':status'];
      }

      if (challengeId) {
        filterExpression += ' AND challengeId = :challengeId';
        expressionValues[':challengeId'] = challengeId;
      }

      const result = await docClient.send(new QueryCommand({
        TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
        IndexName: 'questId-createdAt-index',
        KeyConditionExpression: 'questId = :qid',
        FilterExpression: filterExpression,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: nextToken,
      }));

      submissions = result.Items ?? [];
      lastEvaluatedKey = result.LastEvaluatedKey;
    } else {
      const statusList = status === 'approved'
        ? ['approved', 'auto_approved']
        : [status];

      const pages = await Promise.all(statusList.map((eachStatus) => {
        const expressionNames: Record<string, string> = { '#status': 'status' };
        const expressionValues: Record<string, any> = { ':status': eachStatus };
        let filterExpression: string | undefined = undefined;

        if (challengeId) {
          filterExpression = 'challengeId = :challengeId';
          expressionValues[':challengeId'] = challengeId;
        }

        return docClient.send(new QueryCommand({
          TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
          IndexName: 'status-createdAt-index',
          KeyConditionExpression: '#status = :status',
          ...(filterExpression ? { FilterExpression: filterExpression } : {}),
          ExpressionAttributeNames: expressionNames,
          ExpressionAttributeValues: expressionValues,
          ScanIndexForward: false,
          Limit: limit,
          ExclusiveStartKey: nextToken,
        }));
      }));

      submissions = pages
        .flatMap((result) => result.Items ?? [])
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, limit);
      lastEvaluatedKey = statusList.length === 1 ? pages[0]?.LastEvaluatedKey : undefined;
    }

    const questIds = [...new Set(submissions.map(s => s.questId))];
    let questMap = new Map<string, any>();

    if (questIds.length > 0) {
      const batchResult = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [process.env.QUESTS_TABLE!]: {
            Keys: questIds.map(id => ({ questId: id })),
          },
        },
      }));
      const quests = batchResult.Responses?.[process.env.QUESTS_TABLE!] ?? [];
      questMap = new Map(quests.map((q: any) => [q.questId, q]));
    }

    let enriched = await Promise.all(submissions.map(async (s) => {
      const content = s?.content && typeof s.content === 'object' ? { ...s.content } : s.content;

      if (content && typeof content === 'object') {
        content.imageUrl = await toRenderableMediaUrl(content.imageUrl || null);
        content.videoUrl = await toRenderableMediaUrl(content.videoUrl || null);
        content.thumbnailUrl = await toRenderableMediaUrl(content.thumbnailUrl || null);
      }

      return {
        ...s,
        content,
        quest: questMap.get(s.questId) ?? null,
      };
    }));

    if (questScope && ['leader', 'personal', 'mixed'].includes(questScope)) {
      enriched = enriched.filter(item => item.quest?.questScope === questScope);
    }

    const summary = enriched.reduce((acc: any, item: any) => {
      const s = String(item.status || 'unknown');
      acc.byStatus[s] = (acc.byStatus[s] || 0) + 1;
      const scope = String(item.quest?.questScope || 'unknown');
      acc.byScope[scope] = (acc.byScope[scope] || 0) + 1;
      return acc;
    }, { byStatus: {}, byScope: {} });

    return response(200, {
      success: true,
      data: {
        submissions: enriched,
        total: enriched.length,
        summary,
        nextToken: lastEvaluatedKey
          ? Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64')
          : null,
      },
    });
  } catch (error: any) {
    console.error('Admin list quest submissions error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
