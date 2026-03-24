import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { docClient } from '../../../shared/lib/dynamodb-client';
import { response } from '../../../shared/lib/api-response';
import {
  MYTHOLOGY_CHARACTERS,
  MYTHOLOGY_LINES,
  MythologyLine,
  SLOTS_PER_CHARACTER,
} from '../../../shared/lib/character-constants';

const schema = z.object({
  mythologyLine: z.enum(['korean', 'greek', 'norse']),
});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return response(401, { error: 'UNAUTHORIZED' });

    const body = JSON.parse(event.body || '{}');
    const parsed = schema.safeParse(body);
    if (!parsed.success) return response(400, { error: 'INVALID_INPUT', detail: parsed.error.flatten() });

    const { mythologyLine } = parsed.data as { mythologyLine: MythologyLine };

    // 이미 온보딩 완료 여부 확인
    const userRes = await docClient.send(new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      ProjectionExpression: 'onboardingDone, activeCharacterId',
    }));
    if (userRes.Item?.onboardingDone) {
      return response(409, { error: 'ALREADY_ONBOARDED' });
    }

    // 첫 캐릭터 생성
    const characterId = uuidv4();
    const characterType = MYTHOLOGY_CHARACTERS[mythologyLine][0];
    const now = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: process.env.CHARACTERS_TABLE!,
      Item: {
        characterId,
        userId,
        mythologyLine,
        characterType,
        slots: [],
        filledCount: 0,
        status: 'in_progress',
        createdAt: now,
      },
      ConditionExpression: 'attribute_not_exists(characterId)',
    }));

    // users 테이블 업데이트
    await docClient.send(new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      UpdateExpression: 'SET activeMythology = :m, activeCharacterId = :c, onboardingDone = :t, updatedAt = :now',
      ExpressionAttributeValues: {
        ':m': mythologyLine,
        ':c': characterId,
        ':t': true,
        ':now': now,
      },
    }));

    return response(200, {
      success: true,
      data: { characterId, mythologyLine, characterType, filledCount: 0, totalSlots: SLOTS_PER_CHARACTER },
    });
  } catch (err) {
    console.error('[character/start] error:', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
