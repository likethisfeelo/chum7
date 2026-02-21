import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return response(400, { error: 'MISSING_ID' });
    }

    const result = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!result.Item) {
      return response(404, { error: 'NOT_FOUND' });
    }

    const newStatus = !result.Item.isActive;

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: 'SET isActive = :status, updatedAt = :now',
      ExpressionAttributeValues: {
        ':status': newStatus,
        ':now': new Date().toISOString(),
      },
    }));

    return response(200, {
      success: true,
      message: `챌린지가 ${newStatus ? '활성화' : '비활성화'}되었습니다`,
      data: { isActive: newStatus },
    });

  } catch (error: any) {
    console.error('Toggle challenge error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
