/**
 * PUT    /personal-feed/me/handle  핸들 설정/변경
 * DELETE /personal-feed/me/handle  핸들 삭제
 *
 * 핸들 규칙: 소문자 영숫자 + _ , 3~20자, 숫자/_ 로 시작 불가
 * URL: /personal-feed/@{handle} 로 접근 가능
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const HANDLE_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

function res(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) return res(401, { error: 'UNAUTHORIZED' });

    const method = event.requestContext.http?.method ?? event.httpMethod;

    // ── DELETE /personal-feed/me/handle ──────────────────────────────
    if (method === 'DELETE') {
      await docClient.send(new UpdateCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId },
        UpdateExpression: 'REMOVE feedHandle',
      }));
      return res(200, { success: true });
    }

    // ── PUT /personal-feed/me/handle ──────────────────────────────────
    if (method === 'PUT') {
      let body: { handle?: string } = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch { /* ignore */ }

      const raw = (body.handle ?? '').trim();
      const handle = raw.toLowerCase();

      if (!HANDLE_REGEX.test(handle)) {
        return res(400, {
          error: 'INVALID_HANDLE',
          message: '핸들은 영문으로 시작하고 영숫자·_만 사용 가능하며 3~20자여야 해요',
        });
      }

      // 월 1회 변경 제한 확인
      const userItem = await docClient.send(new GetCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId },
        ProjectionExpression: 'feedHandleUpdatedAt',
      }));
      const lastUpdated = userItem.Item?.feedHandleUpdatedAt as string | undefined;
      if (lastUpdated) {
        const daysSince = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 30) {
          const nextAvailable = new Date(new Date(lastUpdated).getTime() + 30 * 24 * 60 * 60 * 1000);
          return res(429, {
            error: 'CHANGE_LIMIT_EXCEEDED',
            message: `핸들은 30일에 한 번만 변경할 수 있어요. 다음 변경 가능일: ${nextAvailable.toLocaleDateString('ko-KR')}`,
            nextAvailableAt: nextAvailable.toISOString(),
          });
        }
      }

      // 중복 확인 (feedHandle-index GSI)
      const existing = await docClient.send(new QueryCommand({
        TableName: process.env.USERS_TABLE!,
        IndexName: 'feedHandle-index',
        KeyConditionExpression: 'feedHandle = :h',
        ExpressionAttributeValues: { ':h': handle },
        Limit: 1,
      }));

      const taken = existing.Items?.[0];
      if (taken && taken.userId !== userId) {
        return res(409, { error: 'HANDLE_TAKEN', message: '이미 사용 중인 핸들이에요' });
      }

      const now = new Date().toISOString();
      await docClient.send(new UpdateCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId },
        UpdateExpression: 'SET feedHandle = :h, feedHandleUpdatedAt = :now',
        ExpressionAttributeValues: { ':h': handle, ':now': now },
      }));

      return res(200, { success: true, data: { feedHandle: handle, updatedAt: now } });
    }

    return res(405, { error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    console.error('[personal-feed/handle] error', error);
    return res(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
