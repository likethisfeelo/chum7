import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

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

    const participants = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'challengeId-index',
      KeyConditionExpression: 'challengeId = :challengeId',
      ExpressionAttributeValues: { ':challengeId': challengeId },
      Limit: 1,
    }));

    if (participants.Items && participants.Items.length > 0) {
      return response(400, {
        error: 'HAS_PARTICIPANTS',
        message: '참여자가 있는 챌린지는 삭제할 수 없습니다. 비활성화를 사용하세요.',
      });
    }

    await docClient.send(new DeleteCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    return response(200, { success: true, message: '챌린지가 삭제되었습니다' });

  } catch (error: any) {
    console.error('Delete challenge error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
