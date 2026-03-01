import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
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
      return response(403, { error: 'FORBIDDEN', message: '참여자만 챌린지보드를 열람할 수 있습니다.' });
    }

    const result = await client.send(new GetCommand({
      TableName: process.env.CHALLENGE_BOARDS_TABLE!,
      Key: { challengeId },
    }));

    const board = result.Item ?? {
      challengeId,
      blocks: [],
      editors: [],
      isPublic: false,
      updatedAt: null,
      updatedBy: null,
    };

    trackKpiEvent('challenge_board_viewed', { challengeId, actorUserId: userId, at: new Date().toISOString() });

    return response(200, board);
  } catch (error) {
    console.error('get-board error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
