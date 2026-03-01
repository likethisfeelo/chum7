import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { response, getUserId, isParticipant, trackKpiEvent } from '../_shared/common';

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
    const authorName = typeof body.authorName === 'string' && body.authorName.trim() ? body.authorName.trim() : '익명';

    if (!content) return response(400, { error: 'VALIDATION_ERROR', message: '댓글 내용이 필요합니다.' });
    if (content.length > 1000) return response(400, { error: 'VALIDATION_ERROR', message: '댓글은 1000자 이하로 입력해주세요.' });

    const now = new Date().toISOString();
    const commentId = uuidv4();

    const item = {
      commentId,
      challengeId,
      userId,
      authorName,
      content,
      isQuoted: false,
      quotedAt: null,
      createdAt: now,
    };

    await client.send(new PutCommand({
      TableName: process.env.CHALLENGE_COMMENTS_TABLE!,
      Item: item,
    }));

    trackKpiEvent('challenge_comment_created', { challengeId, actorUserId: userId, commentId, at: now });

    return response(200, {
      commentId,
      authorName,
      content,
      createdAt: now,
    });
  } catch (error) {
    console.error('submit-comment error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
