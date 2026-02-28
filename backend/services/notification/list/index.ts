import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
  if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });

  const includeRead = event.queryStringParameters?.includeRead === 'true';
  const result = await docClient.send(new QueryCommand({
    TableName: process.env.NOTIFICATIONS_TABLE!,
    IndexName: 'recipientId-createdAt-index',
    KeyConditionExpression: 'recipientId = :rid',
    ExpressionAttributeValues: { ':rid': userId },
    ScanIndexForward: false,
    Limit: 20,
  }));

  const notifications = (result.Items || []).filter((n: any) => includeRead || !n.isRead);
  return response(200, { success: true, data: notifications });
};
