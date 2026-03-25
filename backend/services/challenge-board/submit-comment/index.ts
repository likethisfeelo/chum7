import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { response, getUserId, isParticipant, trackKpiEvent, createDailyAnonymousId } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const participant = await isParticipant(client, challengeId, userId);
    if (!participant) {
      return response(403, { error: 'FORBIDDEN', message: '참여자만 댓글을 작성할 수 있습니다.' });
    }

    const body = JSON.parse(event.body || '{}');
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const parentCommentId = typeof body.parentCommentId === 'string' ? body.parentCommentId : undefined;
    const dailyAnonymousId = createDailyAnonymousId(challengeId, userId);

    if (!content) return response(400, { error: 'VALIDATION_ERROR', message: '댓글 내용이 필요합니다.' });
    if (content.length > 1000) return response(400, { error: 'VALIDATION_ERROR', message: '댓글은 1000자 이하로 입력해주세요.' });

    const now = new Date().toISOString();
    const commentId = uuidv4();

    const item: Record<string, any> = {
      commentId,
      challengeId,
      userId,
      dailyAnonymousId,
      content,
      isQuoted: false,
      quotedAt: null,
      createdAt: now,
    };

    if (parentCommentId) {
      item.parentCommentId = parentCommentId;
    }

    await client.send(new PutCommand({
      TableName: process.env.CHALLENGE_COMMENTS_TABLE!,
      Item: item,
    }));

    trackKpiEvent('challenge_comment_created', { challengeId, actorUserId: userId, commentId, at: now });

    return response(200, {
      commentId,
      dailyAnonymousId,
      content,
      createdAt: now,
    });
  } catch (error) {
    console.error('submit-comment error', error);
    if ((error as Error).message === 'ANON_SALT_NOT_CONFIGURED') {
      return response(500, { error: 'ANON_SALT_NOT_CONFIGURED', message: '익명 ID 설정값이 누락되었습니다.' });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
