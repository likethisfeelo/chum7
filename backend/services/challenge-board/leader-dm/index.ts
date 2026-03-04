import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createHash, randomUUID } from 'crypto';
import { response, getUserId, isParticipant } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function buildThreadId(challengeId: string, participantId: string, leaderId: string): string {
  const raw = `${challengeId}:${participantId}:${leaderId}`;
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 24);
  return `ldm-${hash}`;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const participantId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;

    if (!participantId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID', message: 'challengeId가 필요합니다.' });

    const participant = await isParticipant(client, challengeId, participantId);
    if (!participant) {
      return response(403, { error: 'FORBIDDEN', message: '참여 확정자만 리더 DM을 시작할 수 있습니다.' });
    }

    const challengeResult = await client.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!challengeResult.Item) {
      return response(404, { error: 'CHALLENGE_NOT_FOUND', message: '챌린지를 찾을 수 없습니다.' });
    }

    const leaderId = challengeResult.Item.creatorId ?? challengeResult.Item.createdBy;
    if (!leaderId) {
      return response(500, { error: 'LEADER_NOT_FOUND', message: '리더 정보를 확인할 수 없습니다.' });
    }

    const threadId = buildThreadId(challengeId, participantId, leaderId);

    const existing = await client.send(new QueryCommand({
      TableName: process.env.NOTIFICATIONS_TABLE!,
      IndexName: 'recipientId-createdAt-index',
      KeyConditionExpression: 'recipientId = :rid',
      FilterExpression: 'metadata.threadId = :tid',
      ExpressionAttributeValues: {
        ':rid': leaderId,
        ':tid': threadId,
      },
      Limit: 1,
      ScanIndexForward: false,
    }));

    if (existing.Items?.length) {
      return response(200, {
        threadId,
        isNew: false,
        deepLink: `/messages/${threadId}`,
      });
    }

    const now = new Date().toISOString();
    await client.send(new PutCommand({
      TableName: process.env.NOTIFICATIONS_TABLE!,
      Item: {
        notificationId: randomUUID(),
        recipientId: leaderId,
        type: 'leader_dm_requested',
        title: '새 리더 DM 요청',
        message: '참여자가 1:1 문의를 시작했습니다.',
        isRead: false,
        createdAt: now,
        metadata: {
          challengeId,
          participantId,
          leaderId,
          threadId,
        },
      },
    }));

    return response(200, {
      threadId,
      isNew: true,
      deepLink: `/messages/${threadId}`,
    });
  } catch (error) {
    console.error('leader-dm error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '리더 DM 생성 중 오류가 발생했습니다.' });
  }
};
