import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

function extractChallengeId(recommendationId: string): string | null {
  const parts = recommendationId.split('#');
  if (parts.length < 2) return null;
  return parts[1] || null;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) return response(401, { message: 'UNAUTHORIZED' });

    const recommendationId = event.pathParameters?.recommendationId;
    if (!recommendationId) return response(400, { message: 'recommendationId required' });

    const now = new Date();
    const suppressUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const recommendedChallengeId = extractChallengeId(recommendationId);

    await ddb.send(new PutCommand({
      TableName: process.env.PLAZA_RECOMMENDATIONS_TABLE!,
      Item: {
        recommendationId,
        userId,
        recommendedChallengeId,
        isDismissed: true,
        createdAt: now.toISOString(),
        dismissAt: now.toISOString(),
        suppressUntil: suppressUntil.toISOString(),
        expiresAtTimestamp: Math.floor(suppressUntil.getTime() / 1000),
      },
    }));

    return response(200, {
      success: true,
      data: {
        suppressUntil: suppressUntil.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Dismiss recommendation error:', error);
    return response(500, {
      message: 'INTERNAL_SERVER_ERROR',
      error: error?.message || 'unknown error',
    });
  }
};
