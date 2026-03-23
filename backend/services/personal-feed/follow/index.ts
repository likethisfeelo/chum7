/**
 * personal-feed/follow
 *
 * 라우트 (모두 이 핸들러):
 *   POST   /personal-feed/{userId}/follow-request     팔로우 요청
 *   PUT    /personal-feed/follow-requests/{followId}/accept   수락
 *   PUT    /personal-feed/follow-requests/{followId}/reject   거절
 *   DELETE /personal-feed/{userId}/follow             팔로워가 직접 취소
 *   DELETE /personal-feed/followers/{followerId}      피드 주인이 강제 해제
 *   GET    /personal-feed/me/followers                팔로워 목록
 *   GET    /personal-feed/me/follow-requests          수신 팔로우 요청 목록
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { sendNotification } from '../../../shared/lib/notification';

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

function followId(followerId: string, followeeId: string): string {
  return `${followerId}#${followeeId}`;
}

async function isBlocked(blockerId: string, blockedUserId: string): Promise<boolean> {
  const result = await docClient.send(new GetCommand({
    TableName: process.env.FEED_BLOCKS_TABLE!,
    Key: { blockId: `${blockerId}#${blockedUserId}` },
  }));
  return !!result.Item;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!requesterId) return res(401, { error: 'UNAUTHORIZED' });

  const method = event.requestContext.http?.method ?? event.httpMethod;
  const path = event.requestContext.http?.path ?? event.rawPath;

  try {
    // ── POST /personal-feed/{userId}/follow-request ──────────────────
    if (method === 'POST' && path.includes('/follow-request')) {
      const followeeId = event.pathParameters?.userId;
      if (!followeeId || followeeId === requesterId) {
        return res(400, { error: 'INVALID_TARGET' });
      }

      // 차단 확인 (양방향)
      if (await isBlocked(followeeId, requesterId)) {
        return res(403, { error: 'BLOCKED' });
      }

      const fId = followId(requesterId, followeeId);
      const existing = await docClient.send(new GetCommand({
        TableName: process.env.FEED_FOLLOWS_TABLE!,
        Key: { followId: fId },
      }));
      if (existing.Item) {
        return res(409, { error: 'ALREADY_EXISTS', status: existing.Item.status });
      }

      const now = new Date().toISOString();
      await docClient.send(new PutCommand({
        TableName: process.env.FEED_FOLLOWS_TABLE!,
        Item: {
          followId: fId,
          followerId: requesterId,
          followeeId,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        },
      }));

      // 알림 전송 (팔로우 요청)
      await sendNotification({
        recipientId: followeeId,
        type: 'feed_follow_request',
        title: '팔로우 요청',
        body: '누군가 회원님의 피드에 팔로우를 요청했어요',
        relatedId: fId,
        relatedType: 'feed_follow',
      }).catch(() => {});

      return res(201, { success: true, data: { followId: fId, status: 'pending' } });
    }

    // ── PUT /personal-feed/follow-requests/{followId}/accept|reject ──
    if (method === 'PUT' && path.includes('/follow-requests/')) {
      const fId = event.pathParameters?.followId;
      if (!fId) return res(400, { error: 'MISSING_FOLLOW_ID' });

      const action = path.endsWith('/accept') ? 'accept' : path.endsWith('/reject') ? 'reject' : null;
      if (!action) return res(400, { error: 'INVALID_ACTION' });

      const item = await docClient.send(new GetCommand({
        TableName: process.env.FEED_FOLLOWS_TABLE!,
        Key: { followId: fId },
      }));
      if (!item.Item) return res(404, { error: 'NOT_FOUND' });
      if (item.Item.followeeId !== requesterId) return res(403, { error: 'FORBIDDEN' });
      if (item.Item.status !== 'pending') return res(409, { error: 'ALREADY_RESOLVED', status: item.Item.status });

      const newStatus = action === 'accept' ? 'accepted' : 'rejected';
      await docClient.send(new UpdateCommand({
        TableName: process.env.FEED_FOLLOWS_TABLE!,
        Key: { followId: fId },
        UpdateExpression: 'SET #s = :s, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': newStatus, ':now': new Date().toISOString() },
      }));

      // 팔로우 수락 알림
      if (action === 'accept') {
        await sendNotification({
          recipientId: item.Item.followerId,
          type: 'feed_follow_accepted',
          title: '팔로우 수락',
          body: '팔로우 요청이 수락됐어요',
          relatedId: fId,
          relatedType: 'feed_follow',
        }).catch(() => {});
      }

      return res(200, { success: true, data: { followId: fId, status: newStatus } });
    }

    // ── DELETE /personal-feed/{userId}/follow (팔로워 자발 취소) ──────
    if (method === 'DELETE' && path.match(/\/personal-feed\/[^/]+\/follow$/)) {
      const followeeId = event.pathParameters?.userId;
      if (!followeeId) return res(400, { error: 'MISSING_USER_ID' });

      const fId = followId(requesterId, followeeId);
      await docClient.send(new DeleteCommand({
        TableName: process.env.FEED_FOLLOWS_TABLE!,
        Key: { followId: fId },
      }));
      return res(200, { success: true });
    }

    // ── DELETE /personal-feed/followers/{followerId} (강제 해제) ──────
    if (method === 'DELETE' && path.includes('/followers/')) {
      const followerId = event.pathParameters?.followerId;
      if (!followerId) return res(400, { error: 'MISSING_FOLLOWER_ID' });

      const fId = followId(followerId, requesterId);
      await docClient.send(new DeleteCommand({
        TableName: process.env.FEED_FOLLOWS_TABLE!,
        Key: { followId: fId },
      }));
      return res(200, { success: true });
    }

    // ── GET /personal-feed/me/followers ──────────────────────────────
    if (method === 'GET' && path.endsWith('/followers')) {
      const result = await docClient.send(new QueryCommand({
        TableName: process.env.FEED_FOLLOWS_TABLE!,
        IndexName: 'followeeId-index',
        KeyConditionExpression: 'followeeId = :me',
        FilterExpression: '#s = :accepted',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':me': requesterId, ':accepted': 'accepted' },
        ScanIndexForward: false,
      }));
      return res(200, {
        success: true,
        data: {
          followers: (result.Items ?? []).map((f) => ({
            followId: f.followId,
            followerId: f.followerId,
            createdAt: f.createdAt,
          })),
        },
      });
    }

    // ── GET /personal-feed/me/follow-requests ────────────────────────
    if (method === 'GET' && path.endsWith('/follow-requests')) {
      const result = await docClient.send(new QueryCommand({
        TableName: process.env.FEED_FOLLOWS_TABLE!,
        IndexName: 'followeeId-index',
        KeyConditionExpression: 'followeeId = :me',
        FilterExpression: '#s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':me': requesterId, ':pending': 'pending' },
        ScanIndexForward: false,
      }));
      return res(200, {
        success: true,
        data: {
          requests: (result.Items ?? []).map((f) => ({
            followId: f.followId,
            followerId: f.followerId,
            createdAt: f.createdAt,
          })),
        },
      });
    }

    return res(404, { error: 'NOT_FOUND' });
  } catch (error) {
    console.error('[personal-feed/follow] error', error);
    return res(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
