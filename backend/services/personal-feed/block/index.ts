/**
 * personal-feed/block
 *
 * 라우트:
 *   POST   /personal-feed/{userId}/block        차단
 *   DELETE /personal-feed/{userId}/block        차단 해제
 *   GET    /personal-feed/me/blocked            차단 목록
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function res(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!requesterId) return res(401, { error: 'UNAUTHORIZED' });

  const method = event.requestContext.http?.method ?? event.httpMethod;
  const path = event.requestContext.http?.path ?? event.rawPath;

  try {
    // ── POST /personal-feed/{userId}/block ────────────────────────────
    if (method === 'POST' && path.includes('/block')) {
      const targetId = event.pathParameters?.userId;
      if (!targetId || targetId === requesterId) {
        return res(400, { error: 'INVALID_TARGET' });
      }

      const blockId = `${requesterId}#${targetId}`;
      await docClient.send(new PutCommand({
        TableName: process.env.FEED_BLOCKS_TABLE!,
        Item: {
          blockId,
          blockerId: requesterId,
          blockedUserId: targetId,
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(blockId)',
      })).catch((err) => {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
        // already blocked — idempotent, ignore
      });

      return res(200, { success: true });
    }

    // ── DELETE /personal-feed/{userId}/block ──────────────────────────
    if (method === 'DELETE' && path.includes('/block')) {
      const targetId = event.pathParameters?.userId;
      if (!targetId) return res(400, { error: 'MISSING_USER_ID' });

      await docClient.send(new DeleteCommand({
        TableName: process.env.FEED_BLOCKS_TABLE!,
        Key: { blockId: `${requesterId}#${targetId}` },
      }));

      return res(200, { success: true });
    }

    // ── GET /personal-feed/me/blocked ─────────────────────────────────
    if (method === 'GET' && path.endsWith('/blocked')) {
      const result = await docClient.send(new QueryCommand({
        TableName: process.env.FEED_BLOCKS_TABLE!,
        IndexName: 'blockerId-index',
        KeyConditionExpression: 'blockerId = :me',
        ExpressionAttributeValues: { ':me': requesterId },
        ScanIndexForward: false,
      }));

      return res(200, {
        success: true,
        data: {
          blocked: (result.Items ?? []).map((b) => ({
            blockId: b.blockId,
            blockedUserId: b.blockedUserId,
            createdAt: b.createdAt,
          })),
        },
      });
    }

    return res(404, { error: 'NOT_FOUND' });
  } catch (error) {
    console.error('[personal-feed/block] error', error);
    return res(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
