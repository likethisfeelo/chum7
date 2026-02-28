import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
  const notificationId = event.pathParameters?.notificationId;
  if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
  if (!notificationId) return response(400, { error: 'MISSING_NOTIFICATION_ID', message: '알림 ID가 필요합니다' });

  const got = await docClient.send(new GetCommand({ TableName: process.env.NOTIFICATIONS_TABLE!, Key: { notificationId } }));
  if (!got.Item) return response(404, { error: 'NOTIFICATION_NOT_FOUND', message: '알림을 찾을 수 없습니다' });
  if (got.Item.recipientId !== userId) return response(403, { error: 'FORBIDDEN', message: '본인 알림만 읽음 처리할 수 있습니다' });

  await docClient.send(new UpdateCommand({
    TableName: process.env.NOTIFICATIONS_TABLE!,
    Key: { notificationId },
    UpdateExpression: 'SET isRead = :r',
    ExpressionAttributeValues: { ':r': true },
  }));

  return response(200, { success: true });
};
