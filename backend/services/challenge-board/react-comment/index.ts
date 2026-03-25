import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { response, getUserId, isParticipant } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const EMOJI_ATTR: Record<string, string> = {
  '❤️': 'reaction_heart',
  '🔥': 'reaction_fire',
  '👏': 'reaction_clap',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;
    const commentId = event.pathParameters?.commentId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
    if (!challengeId || !commentId) return response(400, { error: 'MISSING_PARAMS' });

    const participant = await isParticipant(client, challengeId, userId);
    if (!participant) return response(403, { error: 'FORBIDDEN', message: '참여자만 반응할 수 있습니다.' });

    const body = JSON.parse(event.body || '{}');
    const emoji = body.emoji as string;
    const action = body.action as string;

    const attrName = EMOJI_ATTR[emoji];
    if (!attrName) return response(400, { error: 'INVALID_EMOJI', message: '지원하지 않는 이모지입니다 (❤️ 🔥 👏)' });
    if (action !== 'add' && action !== 'remove') return response(400, { error: 'INVALID_ACTION', message: 'action은 add 또는 remove' });

    await client.send(new UpdateCommand({
      TableName: process.env.CHALLENGE_COMMENTS_TABLE!,
      Key: { commentId },
      UpdateExpression: action === 'add' ? 'ADD #attr :val' : 'DELETE #attr :val',
      ConditionExpression: 'challengeId = :cid',
      ExpressionAttributeNames: { '#attr': attrName },
      ExpressionAttributeValues: {
        ':val': new Set([userId]),
        ':cid': challengeId,
      },
    }));

    return response(200, { success: true, emoji, action });
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      return response(404, { error: 'COMMENT_NOT_FOUND' });
    }
    console.error('react-comment error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
