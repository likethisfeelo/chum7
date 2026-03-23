/**
 * personal-feed/invite
 *
 * 라우트:
 *   POST   /personal-feed/me/invite-links              초대 링크 생성
 *   GET    /personal-feed/me/invite-links              내 링크 목록
 *   DELETE /personal-feed/me/invite-links/{linkId}     링크 삭제
 *   GET    /personal-feed/invite/{token}               토큰으로 피드 주인 확인
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID, randomBytes } from 'crypto';
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

function generateToken(): string {
  return randomBytes(16).toString('base64url');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!requesterId) return res(401, { error: 'UNAUTHORIZED' });

  const method = event.requestContext.http?.method ?? event.httpMethod;
  const path = event.requestContext.http?.path ?? event.rawPath;

  try {
    // ── GET /personal-feed/invite/{token} (토큰 조회 — 비인증도 가능) ──
    if (method === 'GET' && path.includes('/personal-feed/invite/')) {
      const token = event.pathParameters?.token;
      if (!token) return res(400, { error: 'MISSING_TOKEN' });

      const result = await docClient.send(new QueryCommand({
        TableName: process.env.FEED_INVITE_LINKS_TABLE!,
        IndexName: 'token-index',
        KeyConditionExpression: '#t = :token',
        ExpressionAttributeNames: { '#t': 'token' },
        ExpressionAttributeValues: { ':token': token },
        Limit: 1,
      }));

      const link = result.Items?.[0];
      if (!link) return res(404, { error: 'LINK_NOT_FOUND' });

      const now = Math.floor(Date.now() / 1000);
      if (link.expiresAtTimestamp && link.expiresAtTimestamp < now) {
        return res(410, { error: 'LINK_EXPIRED' });
      }
      if (link.maxUses && link.usedCount >= link.maxUses) {
        return res(410, { error: 'LINK_EXHAUSTED' });
      }

      // 사용 횟수 증가
      await docClient.send(new UpdateCommand({
        TableName: process.env.FEED_INVITE_LINKS_TABLE!,
        Key: { inviteLinkId: link.inviteLinkId },
        UpdateExpression: 'SET usedCount = usedCount + :one',
        ExpressionAttributeValues: { ':one': 1 },
      }));

      // 링크 주인에게 알림 (본인이 직접 사용하는 경우 제외)
      if (link.ownerId !== requesterId) {
        sendNotification({
          recipientId: link.ownerId,
          type: 'feed_invite_link_used',
          title: '초대 링크가 사용됐어요',
          body: '누군가 내 초대 링크로 피드를 방문했어요',
          relatedId: link.inviteLinkId,
          relatedType: 'feed_invite_link',
          deepLink: '/personal-feed/settings',
        }).catch(() => {});
      }

      return res(200, {
        success: true,
        data: {
          ownerId: link.ownerId,
          inviteLinkId: link.inviteLinkId,
        },
      });
    }

    // ── POST /personal-feed/me/invite-links ───────────────────────────
    if (method === 'POST' && path.endsWith('/invite-links')) {
      let body: { maxUses?: number; expiresAt?: string } = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch { /* ignore */ }

      const inviteLinkId = randomUUID();
      const token = generateToken();
      const now = new Date().toISOString();

      const expiresAtTimestamp = body.expiresAt
        ? Math.floor(new Date(body.expiresAt).getTime() / 1000)
        : undefined;

      await docClient.send(new PutCommand({
        TableName: process.env.FEED_INVITE_LINKS_TABLE!,
        Item: {
          inviteLinkId,
          ownerId: requesterId,
          token,
          maxUses: body.maxUses ?? null,
          usedCount: 0,
          expiresAt: body.expiresAt ?? null,
          expiresAtTimestamp,
          createdAt: now,
        },
      }));

      return res(201, {
        success: true,
        data: { inviteLinkId, token, maxUses: body.maxUses ?? null, expiresAt: body.expiresAt ?? null },
      });
    }

    // ── GET /personal-feed/me/invite-links ────────────────────────────
    if (method === 'GET' && path.endsWith('/invite-links')) {
      const result = await docClient.send(new QueryCommand({
        TableName: process.env.FEED_INVITE_LINKS_TABLE!,
        IndexName: 'ownerId-index',
        KeyConditionExpression: 'ownerId = :me',
        ExpressionAttributeValues: { ':me': requesterId },
        ScanIndexForward: false,
      }));

      return res(200, {
        success: true,
        data: {
          links: (result.Items ?? []).map((l) => ({
            inviteLinkId: l.inviteLinkId,
            token: l.token,
            maxUses: l.maxUses,
            usedCount: l.usedCount,
            expiresAt: l.expiresAt,
            createdAt: l.createdAt,
          })),
        },
      });
    }

    // ── DELETE /personal-feed/me/invite-links/{linkId} ────────────────
    if (method === 'DELETE' && path.includes('/invite-links/')) {
      const linkId = event.pathParameters?.linkId;
      if (!linkId) return res(400, { error: 'MISSING_LINK_ID' });

      const item = await docClient.send(new GetCommand({
        TableName: process.env.FEED_INVITE_LINKS_TABLE!,
        Key: { inviteLinkId: linkId },
      }));
      if (!item.Item) return res(404, { error: 'NOT_FOUND' });
      if (item.Item.ownerId !== requesterId) return res(403, { error: 'FORBIDDEN' });

      await docClient.send(new DeleteCommand({
        TableName: process.env.FEED_INVITE_LINKS_TABLE!,
        Key: { inviteLinkId: linkId },
      }));

      return res(200, { success: true });
    }

    return res(404, { error: 'NOT_FOUND' });
  } catch (error) {
    console.error('[personal-feed/invite] error', error);
    return res(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
