import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다',
      });
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.BADGES_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false,
    }));

    const badges = (result.Items || []).map((item: any) => ({
      badgeId: item.badgeId,
      grantedAt: item.grantedAt,
      challengeId: item.challengeId || null,
      verificationId: item.verificationId || null,
      sourceDay: typeof item.sourceDay === 'number' ? item.sourceDay : null,
      sourceConsecutiveDays: typeof item.sourceConsecutiveDays === 'number' ? item.sourceConsecutiveDays : null,
    }));

    return response(200, {
      success: true,
      data: {
        badges,
        total: badges.length,
      },
    });
  } catch (error) {
    console.error('[badge-list] error', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다',
    });
  }
};
