/**
 * personal-feed/saved-posts — 광장 게시물 저장/목록
 *
 * 라우트:
 *   POST   /plaza/{plazaPostId}/save        광장 게시물 저장 (토글)
 *   DELETE /plaza/{plazaPostId}/save        저장 취소
 *   GET    /personal-feed/me/saved-posts    저장된 게시물 목록
 *   GET    /plaza/{plazaPostId}/save/status 저장 여부 확인
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!requesterId) return res(401, { error: 'UNAUTHORIZED' });

  const method = event.requestContext.http?.method ?? event.httpMethod;
  const path = event.requestContext.http?.path ?? event.rawPath;

  try {
    // ── POST /plaza/{plazaPostId}/save ────────────────────────────────
    if (method === 'POST' && path.includes('/save')) {
      const plazaPostId = event.pathParameters?.plazaPostId;
      if (!plazaPostId) return res(400, { error: 'MISSING_POST_ID' });

      // 이미 저장 여부 확인 (중복 방지)
      const existing = await docClient.send(new QueryCommand({
        TableName: process.env.SAVED_POSTS_TABLE!,
        IndexName: 'plazaPostId-index',
        KeyConditionExpression: 'plazaPostId = :pid AND userId = :uid',
        ExpressionAttributeValues: { ':pid': plazaPostId, ':uid': requesterId },
        Limit: 1,
      }));

      if (existing.Items && existing.Items.length > 0) {
        return res(409, { error: 'ALREADY_SAVED', saveId: existing.Items[0].saveId });
      }

      // 광장 게시물 존재 확인
      const plazaPost = await docClient.send(new GetCommand({
        TableName: process.env.PLAZA_POSTS_TABLE!,
        Key: { postId: plazaPostId },
      }));
      if (!plazaPost.Item) return res(404, { error: 'POST_NOT_FOUND' });

      const saveId = randomUUID();
      const savedAt = new Date().toISOString();

      await docClient.send(new PutCommand({
        TableName: process.env.SAVED_POSTS_TABLE!,
        Item: {
          saveId,
          userId: requesterId,
          plazaPostId,
          savedAt,
          // 게시물 스냅샷 (목록 조회 시 join 불필요)
          postSnapshot: {
            postType: plazaPost.Item.postType,
            content: (plazaPost.Item.content as string ?? '').slice(0, 200),
            createdAt: plazaPost.Item.createdAt,
          },
        },
      }));

      return res(201, { success: true, data: { saveId, savedAt } });
    }

    // ── DELETE /plaza/{plazaPostId}/save ──────────────────────────────
    if (method === 'DELETE' && path.includes('/save')) {
      const plazaPostId = event.pathParameters?.plazaPostId;
      if (!plazaPostId) return res(400, { error: 'MISSING_POST_ID' });

      const existing = await docClient.send(new QueryCommand({
        TableName: process.env.SAVED_POSTS_TABLE!,
        IndexName: 'plazaPostId-index',
        KeyConditionExpression: 'plazaPostId = :pid AND userId = :uid',
        ExpressionAttributeValues: { ':pid': plazaPostId, ':uid': requesterId },
        Limit: 1,
      }));

      if (!existing.Items || existing.Items.length === 0) {
        return res(404, { error: 'NOT_SAVED' });
      }

      await docClient.send(new DeleteCommand({
        TableName: process.env.SAVED_POSTS_TABLE!,
        Key: { saveId: existing.Items[0].saveId },
      }));

      return res(200, { success: true });
    }

    // ── GET /plaza/{plazaPostId}/save/status ──────────────────────────
    if (method === 'GET' && path.includes('/save/status')) {
      const plazaPostId = event.pathParameters?.plazaPostId;
      if (!plazaPostId) return res(400, { error: 'MISSING_POST_ID' });

      const existing = await docClient.send(new QueryCommand({
        TableName: process.env.SAVED_POSTS_TABLE!,
        IndexName: 'plazaPostId-index',
        KeyConditionExpression: 'plazaPostId = :pid AND userId = :uid',
        ExpressionAttributeValues: { ':pid': plazaPostId, ':uid': requesterId },
        Limit: 1,
      }));

      const saved = (existing.Items ?? []).length > 0;
      return res(200, {
        success: true,
        data: {
          saved,
          saveId: saved ? existing.Items![0].saveId : null,
        },
      });
    }

    // ── GET /personal-feed/me/saved-posts ─────────────────────────────
    if (method === 'GET' && path.endsWith('/saved-posts')) {
      const nextToken = event.queryStringParameters?.nextToken;
      const limit = Math.min(Number(event.queryStringParameters?.limit ?? 20), 50);

      let exclusiveStartKey: Record<string, unknown> | undefined;
      try {
        if (nextToken) {
          exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf8'));
        }
      } catch { /* ignore */ }

      const result = await docClient.send(new QueryCommand({
        TableName: process.env.SAVED_POSTS_TABLE!,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :me',
        ExpressionAttributeValues: { ':me': requesterId },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }));

      const newNextToken = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
        : null;

      return res(200, {
        success: true,
        data: {
          savedPosts: (result.Items ?? []).map((s) => ({
            saveId: s.saveId,
            plazaPostId: s.plazaPostId,
            savedAt: s.savedAt,
            postSnapshot: s.postSnapshot,
          })),
          nextToken: newNextToken,
        },
      });
    }

    return res(404, { error: 'NOT_FOUND' });
  } catch (error) {
    console.error('[personal-feed/saved-posts] error', error);
    return res(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
