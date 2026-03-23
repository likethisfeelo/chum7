/**
 * PUT /personal-feed/me/settings
 * feedSettings: { isPublic?, tab02Public? } 부분 업데이트
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
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
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) return res(401, { error: 'UNAUTHORIZED' });

    let body: { isPublic?: boolean; tab02Public?: boolean } = {};
    try { body = event.body ? JSON.parse(event.body) : {}; } catch { /* ignore */ }

    if (body.isPublic === undefined && body.tab02Public === undefined) {
      return res(400, { error: 'NO_UPDATES' });
    }

    // 현재 feedSettings 조회 후 머지 (DynamoDB nested map 안전 업데이트)
    const current = await docClient.send(new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      ProjectionExpression: 'feedSettings',
    }));

    const currentSettings = (current.Item?.feedSettings as Record<string, boolean>) ?? {};
    const newSettings: Record<string, boolean> = {
      isPublic: currentSettings.isPublic ?? false,
      tab02Public: currentSettings.tab02Public ?? false,
      ...(body.isPublic !== undefined ? { isPublic: Boolean(body.isPublic) } : {}),
      ...(body.tab02Public !== undefined ? { tab02Public: Boolean(body.tab02Public) } : {}),
    };

    await docClient.send(new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      UpdateExpression: 'SET feedSettings = :settings',
      ExpressionAttributeValues: { ':settings': newSettings },
    }));

    return res(200, { success: true, data: { feedSettings: newSettings } });
  } catch (error) {
    console.error('[personal-feed/settings] error', error);
    return res(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
