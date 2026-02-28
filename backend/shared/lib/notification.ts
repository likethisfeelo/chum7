import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export async function sendNotification(params: {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  relatedId: string;
  relatedType: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await docClient.send(new PutCommand({
    TableName: process.env.NOTIFICATIONS_TABLE!,
    Item: {
      notificationId: uuidv4(),
      recipientId: params.recipientId,
      type: params.type,
      title: params.title,
      body: params.body,
      relatedId: params.relatedId,
      relatedType: params.relatedType,
      isRead: false,
      createdAt: now,
    },
  }));
}
