import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { response, getUserId, validateBlocks, trackKpiEvent } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const challengeRes = await client.send(
      new GetCommand({ TableName: process.env.CHALLENGES_TABLE!, Key: { challengeId } })
    );
    const challenge = challengeRes.Item;

    if (!challenge) return response(404, { error: 'CHALLENGE_NOT_FOUND' });

    const isLeader = challenge.creatorId === userId || challenge.createdBy === userId;
    if (!isLeader) return response(403, { error: 'FORBIDDEN', message: '편집 권한이 없습니다.' });

    if (['completed', 'archived'].includes(challenge.lifecycle)) {
      return response(409, { error: 'CHALLENGE_COMPLETED', message: '종료된 챌린지의 보드는 수정할 수 없습니다.' });
    }

    const body = JSON.parse(event.body || '{}');
    const blocks = body.blocks;
    const check = validateBlocks(blocks, true);
    if (!check.valid) return response(400, { error: 'VALIDATION_ERROR', message: check.message });

    const now = new Date().toISOString();
    await client.send(new PutCommand({
      TableName: process.env.CHALLENGE_BOARDS_TABLE!,
      Item: {
        challengeId,
        blocks,
        editors: body.editors ?? [],
        isPublic: false,
        updatedAt: now,
        updatedBy: userId,
      },
    }));

    trackKpiEvent('leader_board_updated', { challengeId, actorUserId: userId, at: now, blockCount: blocks.length });

    return response(200, { success: true, updatedAt: now });
  } catch (error) {
    console.error('upsert-board error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
