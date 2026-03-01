import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { response, getUserId, isLeader, validateBlocks, trackKpiEvent } from '../_shared/common';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserId(event);
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID' });

    const leader = await isLeader(client, challengeId, userId);
    if (!leader) return response(403, { error: 'FORBIDDEN', message: '편집 권한이 없습니다.' });

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
