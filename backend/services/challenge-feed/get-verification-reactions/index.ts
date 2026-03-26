import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { response, getUserId, wasParticipant } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;
    const verificationId = event.pathParameters?.verificationId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED' });
    if (!challengeId || !verificationId) return response(400, { error: 'MISSING_PARAMS' });

    const participant = await wasParticipant(client, challengeId, userId);
    if (!participant) return response(403, { error: 'FORBIDDEN', message: '참여자만 열람할 수 있습니다.' });

    const result = await client.send(new QueryCommand({
      TableName: process.env.VERIFICATION_REACTIONS_TABLE!,
      IndexName: 'verificationId-index',
      KeyConditionExpression: 'verificationId = :vid',
      ExpressionAttributeValues: { ':vid': verificationId },
    }));

    // emoji 별로 집계
    const emojiMap = new Map<string, { count: number; myReacted: boolean }>();
    for (const item of result.Items ?? []) {
      const emoji: string = item.emoji;
      if (!emoji) continue;
      const existing = emojiMap.get(emoji) ?? { count: 0, myReacted: false };
      emojiMap.set(emoji, {
        count: existing.count + 1,
        myReacted: existing.myReacted || item.userId === userId,
      });
    }

    const reactions = Array.from(emojiMap.entries()).map(([emoji, { count, myReacted }]) => ({
      emoji, count, myReacted,
    }));

    return response(200, { data: reactions });
  } catch (err) {
    console.error('get-verification-reactions error', err);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
