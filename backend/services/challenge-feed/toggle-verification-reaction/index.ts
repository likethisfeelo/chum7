/**
 * POST  → add reaction
 * DELETE → remove reaction
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { response, getUserId, isParticipant, getChallengeMeta } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ALLOWED_EMOJIS = new Set(['🔥', '💪', '👏', '❤️', '🎉', '⭐', '😮', '😂', '🙌', '💡']);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;
    const verificationId = event.pathParameters?.verificationId;
    const method = event.httpMethod || event.requestContext?.http?.method;

    if (!userId) return response(401, { error: 'UNAUTHORIZED' });
    if (!challengeId || !verificationId) return response(400, { error: 'MISSING_PARAMS' });

    const body = event.body ? JSON.parse(event.body) : {};
    const emoji: string = body.emoji;
    if (!emoji || !ALLOWED_EMOJIS.has(emoji)) {
      return response(400, { error: 'INVALID_EMOJI', message: '허용되지 않은 이모지입니다.' });
    }

    const meta = await getChallengeMeta(client, challengeId);
    if (!meta) return response(404, { error: 'CHALLENGE_NOT_FOUND' });
    if (meta.lifecycle !== 'active') {
      return response(403, { error: 'CHALLENGE_NOT_ACTIVE', message: '챌린지 기간에만 반응할 수 있습니다.' });
    }

    const participant = await isParticipant(client, challengeId, userId);
    if (!participant) return response(403, { error: 'FORBIDDEN', message: '참여자만 반응할 수 있습니다.' });

    // reactionId = 유저 1명이 검증 1개에 이모지 1개씩만 (composite key)
    const reactionId = `${verificationId}#${userId}#${emoji}`;
    const table = process.env.VERIFICATION_REACTIONS_TABLE!;

    if (method === 'DELETE') {
      await client.send(new DeleteCommand({ TableName: table, Key: { reactionId } }));
      return response(200, { data: { removed: true, emoji } });
    }

    // POST — add (idempotent via put)
    await client.send(new PutCommand({
      TableName: table,
      Item: {
        reactionId,
        verificationId,
        challengeId,
        userId,
        emoji,
        createdAt: new Date().toISOString(),
      },
    }));
    return response(200, { data: { added: true, emoji } });
  } catch (err) {
    console.error('toggle-verification-reaction error', err);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
