import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function res(statusCode: number, body: unknown): APIGatewayProxyResult {
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

function decodeCursor(raw?: string): Record<string, any> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

function encodeCursor(key: Record<string, any> | undefined): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString('base64');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  const method = event.httpMethod || (event.requestContext as any)?.http?.method;
  const rawPath = (event.requestContext as any)?.http?.path ?? event.path ?? '';

  const tag = event.pathParameters?.tag;

  try {
    // ── GET /hashtags (list — no tag param) ───────────────────────────
    if (!tag && method === 'GET') {
      const limit = Math.max(1, Math.min(20, Number(event.queryStringParameters?.limit ?? '7')));

      const result = await ddb.send(new ScanCommand({
        TableName: process.env.HASHTAGS_TABLE!,
        ProjectionExpression: 'hashtag, registeredAt, postCount, creatorAnimalIcon, creatorPublic',
      }));

      const items = (result.Items ?? [])
        .sort((a: any, b: any) => (b.registeredAt ?? '').localeCompare(a.registeredAt ?? ''))
        .slice(0, limit)
        .map((item: any) => ({
          hashtag: item.hashtag,
          registeredAt: item.registeredAt,
          postCount: item.postCount ?? 0,
          creatorAnimalIcon: item.creatorPublic !== false ? item.creatorAnimalIcon : null,
        }));

      return res(200, { success: true, data: { hashtags: items } });
    }

    if (!tag) return res(400, { error: 'TAG_REQUIRED' });
    // ── GET /hashtags/:tag/follow/status ──────────────────────────────
    if (method === 'GET' && rawPath.endsWith('/follow/status')) {
      if (!userId) return res(401, { error: 'UNAUTHORIZED' });

      const existing = await ddb.send(new QueryCommand({
        TableName: process.env.HASHTAG_FOLLOWS_TABLE!,
        IndexName: 'userId-hashtag-index',
        KeyConditionExpression: 'userId = :uid AND hashtag = :tag',
        ExpressionAttributeValues: { ':uid': userId, ':tag': tag },
        Limit: 1,
      }));

      const followed = (existing.Items ?? []).length > 0;
      return res(200, {
        success: true,
        data: {
          followed,
          followId: followed ? existing.Items![0].followId : null,
        },
      });
    }

    // ── GET /hashtags/:tag/posts ───────────────────────────────────────
    if (method === 'GET' && rawPath.endsWith('/posts')) {
      const params = event.queryStringParameters || {};
      const limit = Math.max(1, Math.min(50, Number(params.limit || '20')));
      const cursor = decodeCursor(params.cursor ?? undefined);

      const result = await ddb.send(new QueryCommand({
        TableName: process.env.PLAZA_POSTS_TABLE!,
        IndexName: 'hashtag-createdAt-index',
        KeyConditionExpression: 'hashtag = :tag',
        ExpressionAttributeValues: { ':tag': tag },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor,
      }));

      return res(200, {
        success: true,
        data: {
          posts: (result.Items ?? []).map((item: any) => ({
            plazaPostId: item.plazaPostId,
            postType: item.postType,
            challengeTitle: item.challengeTitle,
            challengeCategory: item.challengeCategory,
            currentDay: item.currentDay,
            content: item.content,
            imageUrl: item.imageUrl,
            hashtag: item.hashtag,
            likeCount: item.likeCount ?? 0,
            commentCount: item.commentCount ?? 0,
            createdAt: item.createdAt,
          })),
          hasMore: Boolean(result.LastEvaluatedKey),
          nextCursor: encodeCursor(result.LastEvaluatedKey),
        },
      });
    }

    // ── GET /hashtags/:tag ────────────────────────────────────────────
    if (method === 'GET') {
      const [hashtagItem, followerCountResult] = await Promise.all([
        ddb.send(new GetCommand({
          TableName: process.env.HASHTAGS_TABLE!,
          Key: { hashtag: tag },
        })),
        ddb.send(new QueryCommand({
          TableName: process.env.HASHTAG_FOLLOWS_TABLE!,
          IndexName: 'hashtag-index',
          KeyConditionExpression: 'hashtag = :tag',
          ExpressionAttributeValues: { ':tag': tag },
          Select: 'COUNT',
        })),
      ]);

      if (!hashtagItem.Item) {
        return res(404, { error: 'HASHTAG_NOT_FOUND' });
      }

      const item = hashtagItem.Item;
      const followerCount = followerCountResult.Count ?? 0;
      const creatorPublic = item.creatorPublic !== false;

      return res(200, {
        success: true,
        data: {
          hashtag: item.hashtag,
          registeredAt: item.registeredAt,
          postCount: item.postCount ?? 0,
          followerCount,
          creator: creatorPublic
            ? { animalIcon: item.creatorAnimalIcon }
            : null,
        },
      });
    }

    if (!userId) return res(401, { error: 'UNAUTHORIZED' });

    // ── POST /hashtags/:tag/follow ────────────────────────────────────
    if (method === 'POST') {
      const existing = await ddb.send(new QueryCommand({
        TableName: process.env.HASHTAG_FOLLOWS_TABLE!,
        IndexName: 'userId-hashtag-index',
        KeyConditionExpression: 'userId = :uid AND hashtag = :tag',
        ExpressionAttributeValues: { ':uid': userId, ':tag': tag },
        Limit: 1,
      }));

      if ((existing.Items ?? []).length > 0) {
        return res(409, { error: 'ALREADY_FOLLOWING', followId: existing.Items![0].followId });
      }

      const followId = randomUUID();
      const followedAt = new Date().toISOString();

      await ddb.send(new PutCommand({
        TableName: process.env.HASHTAG_FOLLOWS_TABLE!,
        Item: { followId, userId, hashtag: tag, followedAt },
      }));

      // followerCount는 GSI COUNT 쿼리로 실시간 계산하므로 별도 증분 불필요

      return res(201, { success: true, data: { followId, followedAt } });
    }

    // ── DELETE /hashtags/:tag/follow ──────────────────────────────────
    if (method === 'DELETE') {
      const existing = await ddb.send(new QueryCommand({
        TableName: process.env.HASHTAG_FOLLOWS_TABLE!,
        IndexName: 'userId-hashtag-index',
        KeyConditionExpression: 'userId = :uid AND hashtag = :tag',
        ExpressionAttributeValues: { ':uid': userId, ':tag': tag },
        Limit: 1,
      }));

      if (!existing.Items || existing.Items.length === 0) {
        return res(404, { error: 'NOT_FOLLOWING' });
      }

      await ddb.send(new DeleteCommand({
        TableName: process.env.HASHTAG_FOLLOWS_TABLE!,
        Key: { followId: existing.Items[0].followId },
      }));

      return res(200, { success: true });
    }

    return res(404, { error: 'NOT_FOUND' });
  } catch (error: any) {
    console.error('[hashtag] error', error);
    return res(500, { error: 'INTERNAL_SERVER_ERROR', message: error?.message ?? 'unknown' });
  }
};
