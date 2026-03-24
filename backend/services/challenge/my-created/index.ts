import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function apiResponse(statusCode: number, body: any): APIGatewayProxyResult {
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
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return apiResponse(401, { error: 'UNAUTHORIZED' });

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      IndexName: 'createdBy-index',
      KeyConditionExpression: 'createdBy = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }));

    const challenges = (result.Items ?? []).sort(
      (a, b) => (b.createdAt as string).localeCompare(a.createdAt as string),
    );

    return apiResponse(200, {
      success: true,
      data: { challenges, total: challenges.length },
    });
  } catch (err) {
    console.error('[challenge/my-created] error:', err);
    return apiResponse(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
