import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { response, getUserId, wasParticipant, getChallengeMeta, createPersistentAnonymousId } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;
    const verificationId = event.pathParameters?.verificationId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED' });
    if (!challengeId || !verificationId) return response(400, { error: 'MISSING_PARAMS' });

    const participant = await wasParticipant(client, challengeId, userId);
    if (!participant) return response(403, { error: 'FORBIDDEN', message: '참여자만 댓글을 열람할 수 있습니다.' });

    const meta = await getChallengeMeta(client, challengeId);
    const challengeEnded = meta?.lifecycle === 'completed' || meta?.lifecycle === 'failed';
    const leaderId = meta?.leaderId ?? null;

    const result = await client.send(new QueryCommand({
      TableName: process.env.VERIFICATION_COMMENTS_TABLE!,
      IndexName: 'verificationId-createdAt-index',
      KeyConditionExpression: 'verificationId = :vid',
      ExpressionAttributeValues: { ':vid': verificationId },
      ScanIndexForward: true, // 오래된 순
      Limit: 50,
    }));

    const comments = (result.Items ?? []).map((item: any) => {
      const isOwn = item.userId === userId;
      const isLeaderComment = !!leaderId && item.userId === leaderId;

      // 진행 중: 일일 익명 ID / 종료 후: 안정적 익명 ID (창의적 동물 이름)
      let displayName: string;
      try {
        displayName = challengeEnded
          ? createPersistentAnonymousId(challengeId, item.userId)
          : (item.dailyAnonymousId ?? '익명');
      } catch {
        displayName = '익명';
      }

      return {
        commentId: item.commentId,
        displayName,
        isLeader: isLeaderComment,
        isOwn,
        content: item.content,
        createdAt: item.createdAt,
      };
    });

    return response(200, { data: comments });
  } catch (err) {
    console.error('get-verification-comments error', err);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
