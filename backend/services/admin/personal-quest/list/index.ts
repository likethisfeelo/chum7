import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const res = (statusCode: number, body: any): APIGatewayProxyResult => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const challengeId = event.pathParameters?.challengeId;
  if (!challengeId) return res(400, { error: 'MISSING_CHALLENGE_ID', message: 'challengeId가 필요합니다' });
  const status = event.queryStringParameters?.status || 'pending';
  const result = await docClient.send(new QueryCommand({
    TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!,
    IndexName: 'challengeId-status-index',
    KeyConditionExpression: 'challengeId = :cid AND #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':cid': challengeId, ':status': status },
  }));
  return res(200, { success: true, data: result.Items || [] });
};
