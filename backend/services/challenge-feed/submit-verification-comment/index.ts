import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { response, getUserId, isParticipant, getChallengeMeta, createDailyAnonymousId } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;
    const verificationId = event.pathParameters?.verificationId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED' });
    if (!challengeId || !verificationId) return response(400, { error: 'MISSING_PARAMS' });

    const meta = await getChallengeMeta(client, challengeId);
    if (!meta) return response(404, { error: 'CHALLENGE_NOT_FOUND' });
    if (meta.lifecycle !== 'active') {
      return response(403, { error: 'CHALLENGE_NOT_ACTIVE', message: '챌린지 기간에만 댓글을 작성할 수 있습니다.' });
    }

    const participant = await isParticipant(client, challengeId, userId);
    if (!participant) return response(403, { error: 'FORBIDDEN', message: '참여자만 댓글을 작성할 수 있습니다.' });

    const body = event.body ? JSON.parse(event.body) : {};
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return response(400, { error: 'VALIDATION_ERROR', message: '댓글 내용이 필요합니다.' });
    if (content.length > 300) return response(400, { error: 'VALIDATION_ERROR', message: '댓글은 300자 이하로 입력해주세요.' });

    let dailyAnonymousId = '익명';
    try {
      dailyAnonymousId = createDailyAnonymousId(challengeId, userId);
    } catch {
      // ANON_ID_SALT 미설정 시 fallback
    }

    const commentId = uuidv4();
    const now = new Date().toISOString();

    await client.send(new PutCommand({
      TableName: process.env.VERIFICATION_COMMENTS_TABLE!,
      Item: {
        commentId,
        verificationId,
        challengeId,
        userId,
        dailyAnonymousId,
        content,
        createdAt: now,
      },
    }));

    return response(200, {
      data: {
        commentId,
        displayName: dailyAnonymousId,
        isLeader: meta.leaderId === userId,
        isOwn: true,
        content,
        createdAt: now,
      },
    });
  } catch (err) {
    console.error('submit-verification-comment error', err);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
