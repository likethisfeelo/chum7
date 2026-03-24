import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../../shared/lib/dynamodb-client';
import { response } from '../../../shared/lib/api-response';
import {
  MYTHOLOGY_CHARACTERS,
  MYTHOLOGY_LINES,
  MythologyLine,
  SLOTS_PER_CHARACTER,
} from '../../../shared/lib/character-constants';

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return response(401, { error: 'UNAUTHORIZED' });

    // 사용자 정보 조회
    const userRes = await docClient.send(new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      ProjectionExpression:
        'activeMythology, activeCharacterId, completedMythologies, onboardingDone, themeOverride',
    }));
    const user = userRes.Item;

    if (!user?.onboardingDone) {
      return response(200, {
        success: true,
        data: {
          onboardingDone: false,
          activeMythology: null,
          activeCharacter: null,
          mythologyProgress: buildEmptyProgress(),
          completedMythologies: [],
        },
      });
    }

    // 현재 캐릭터 조회
    let activeCharacter = null;
    if (user.activeCharacterId) {
      const charRes = await docClient.send(new GetCommand({
        TableName: process.env.CHARACTERS_TABLE!,
        Key: { characterId: user.activeCharacterId },
      }));
      if (charRes.Item) {
        activeCharacter = {
          characterId: charRes.Item.characterId,
          mythologyLine: charRes.Item.mythologyLine,
          characterType: charRes.Item.characterType,
          filledCount: charRes.Item.filledCount ?? 0,
          totalSlots: SLOTS_PER_CHARACTER,
          slots: charRes.Item.slots ?? [],
          status: charRes.Item.status,
        };
      }
    }

    // 세계관별 진행 상황 (완성 캐릭터 수 집계)
    const allCharsRes = await docClient.send(new QueryCommand({
      TableName: process.env.CHARACTERS_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: '#st = :complete',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':uid': userId, ':complete': 'complete' },
      ProjectionExpression: 'mythologyLine',
    }));

    const completedCountByLine: Record<string, number> = {};
    for (const char of (allCharsRes.Items ?? [])) {
      const ml = char.mythologyLine as string;
      completedCountByLine[ml] = (completedCountByLine[ml] ?? 0) + 1;
    }

    const mythologyProgress: Record<string, { total: number; completed: number; isCompleted: boolean }> = {};
    for (const line of MYTHOLOGY_LINES) {
      const total = MYTHOLOGY_CHARACTERS[line as MythologyLine].length;
      const completed = completedCountByLine[line] ?? 0;
      mythologyProgress[line] = { total, completed, isCompleted: completed >= total };
    }

    const completedMythologies = (user.completedMythologies as string[]) ?? [];

    return response(200, {
      success: true,
      data: {
        onboardingDone: true,
        activeMythology: user.activeMythology ?? null,
        activeCharacter,
        mythologyProgress,
        completedMythologies,
        themeOverride: user.themeOverride ?? null,
      },
    });
  } catch (err) {
    console.error('[character/status] error:', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};

function buildEmptyProgress() {
  const result: Record<string, { total: number; completed: number; isCompleted: boolean }> = {};
  for (const line of MYTHOLOGY_LINES) {
    result[line] = {
      total: MYTHOLOGY_CHARACTERS[line as MythologyLine].length,
      completed: 0,
      isCompleted: false,
    };
  }
  return result;
}
