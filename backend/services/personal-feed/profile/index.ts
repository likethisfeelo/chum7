import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
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
  try {
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!requesterId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const userIdParam = event.pathParameters?.userId;
    const targetUserId = userIdParam === 'me' ? requesterId : userIdParam;

    if (!targetUserId) {
      return response(400, { error: 'MISSING_USER_ID', message: 'userId가 필요합니다' });
    }

    const userResult = await docClient.send(new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: targetUserId },
    }));

    if (!userResult.Item) {
      return response(404, { error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' });
    }

    const user = userResult.Item;
    const feedSettings = (user.feedSettings as Record<string, unknown>) ?? { isPublic: false };

    return response(200, {
      success: true,
      data: {
        userId: user.userId,
        displayName: user.name,
        animalIcon: user.animalIcon ?? '🐰',
        feedSettings: {
          isPublic: Boolean(feedSettings.isPublic),
        },
      },
    });
  } catch (error) {
    console.error('[personal-feed/profile] error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
