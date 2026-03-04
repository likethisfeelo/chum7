import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { response, getUserId, isLeader, trackKpiEvent } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;
    const commentId = event.pathParameters?.commentId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });
    if (!commentId) return response(400, { error: 'MISSING_COMMENT_ID' });

    const leader = await isLeader(client, challengeId, userId);
    if (!leader) return response(403, { error: 'FORBIDDEN', message: '인용 권한이 없습니다.' });

    const body = JSON.parse(event.body || '{}');
    const insertAfterBlockId = body.insertAfterBlockId ?? null;

    const [boardResult, commentResult] = await Promise.all([
      client.send(new GetCommand({ TableName: process.env.CHALLENGE_BOARDS_TABLE!, Key: { challengeId } })),
      client.send(new GetCommand({ TableName: process.env.CHALLENGE_COMMENTS_TABLE!, Key: { commentId } })),
    ]);

    const comment = commentResult.Item;
    if (!comment || comment.challengeId !== challengeId) {
      return response(404, { error: 'COMMENT_NOT_FOUND' });
    }

    const blocks = Array.isArray(boardResult.Item?.blocks) ? [...boardResult.Item.blocks] : [];
    const newBlock = {
      id: `q-${uuidv4()}`,
      type: 'quote',
      commentId,
      authorName: comment.dailyAnonymousId ?? comment.authorName ?? '익명-000',
      content: comment.content,
    };

    if (!insertAfterBlockId) {
      blocks.push(newBlock);
    } else {
      const idx = blocks.findIndex((b: any) => b.id === insertAfterBlockId);
      if (idx === -1) {
        blocks.push(newBlock);
      } else {
        blocks.splice(idx + 1, 0, newBlock);
      }
    }

    const now = new Date().toISOString();

    await Promise.all([
      client.send(new PutCommand({
        TableName: process.env.CHALLENGE_BOARDS_TABLE!,
        Item: {
          challengeId,
          blocks,
          editors: boardResult.Item?.editors ?? [],
          isPublic: false,
          updatedAt: now,
          updatedBy: userId,
        },
      })),
      client.send(new UpdateCommand({
        TableName: process.env.CHALLENGE_COMMENTS_TABLE!,
        Key: { commentId },
        UpdateExpression: 'SET isQuoted = :true, quotedAt = :now',
        ExpressionAttributeValues: {
          ':true': true,
          ':now': now,
        },
      })),
    ]);

    trackKpiEvent('challenge_comment_quoted', { challengeId, actorUserId: userId, commentId, at: now });

    return response(200, { success: true, newBlock });
  } catch (error) {
    console.error('quote-comment error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
