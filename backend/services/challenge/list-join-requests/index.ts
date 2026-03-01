import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const challengeId = event.pathParameters?.challengeId;

    if (!requesterId) return response(401, { error: 'UNAUTHORIZED' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const challengeRes = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!challengeRes.Item) return response(404, { error: 'CHALLENGE_NOT_FOUND' });
    if (challengeRes.Item.creatorId !== requesterId) return response(403, { error: 'FORBIDDEN' });

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'challengeId-index',
      KeyConditionExpression: 'challengeId = :cid',
      FilterExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':cid': challengeId,
        ':pending': 'pending',
      },
      ScanIndexForward: false,
      Limit: 100,
    }));

    return response(200, {
      requests: result.Items ?? [],
      total: (result.Items ?? []).length,
    });
  } catch (error) {
    console.error('list-join-requests error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
