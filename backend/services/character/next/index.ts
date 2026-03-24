import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { docClient } from '../../../shared/lib/dynamodb-client';
import { response } from '../../../shared/lib/api-response';
import {
  MYTHOLOGY_CHARACTERS,
  MythologyLine,
  SLOTS_PER_CHARACTER,
} from '../../../shared/lib/character-constants';

const schema = z.object({
  // 같은 세계관에서 계속할 경우 characterType 선택 가능,
  // 다른 세계관으로 전환할 경우 mythologyLine 지정
  mythologyLine: z.enum(['korean', 'greek', 'norse']).optional(),
  characterType: z.string().optional(),
});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return response(401, { error: 'UNAUTHORIZED' });

    const body = JSON.parse(event.body || '{}');
    const parsed = schema.safeParse(body);
    if (!parsed.success) return response(400, { error: 'INVALID_INPUT' });

    const userRes = await docClient.send(new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      ProjectionExpression: 'activeMythology, activeCharacterId, completedMythologies',
    }));
    const user = userRes.Item;
    if (!user) return response(404, { error: 'USER_NOT_FOUND' });

    // 현재 캐릭터가 완성 상태인지 확인
    if (user.activeCharacterId) {
      const curChar = await docClient.send(new GetCommand({
        TableName: process.env.CHARACTERS_TABLE!,
        Key: { characterId: user.activeCharacterId },
        ProjectionExpression: '#st, filledCount',
        ExpressionAttributeNames: { '#st': 'status' },
      }));
      if (curChar.Item?.status === 'in_progress' && (curChar.Item?.filledCount ?? 0) < SLOTS_PER_CHARACTER) {
        return response(409, { error: 'CURRENT_CHARACTER_INCOMPLETE' });
      }
    }

    const targetMythology = (parsed.data.mythologyLine ?? user.activeMythology) as MythologyLine;
    const completedMythologies = (user.completedMythologies as string[]) ?? [];

    // 다른 세계관으로 전환하려면 현재 세계관이 완성되어야 함
    if (targetMythology !== user.activeMythology) {
      if (!completedMythologies.includes(user.activeMythology as string)) {
        return response(403, { error: 'MYTHOLOGY_NOT_COMPLETED', message: '현재 세계관을 완성해야 다른 세계관으로 이동할 수 있어요' });
      }
    }

    const characters = MYTHOLOGY_CHARACTERS[targetMythology];

    // 선택한 캐릭터 타입 결정 (없으면 해당 세계관에서 아직 시작 안 한 첫 캐릭터)
    let characterType = parsed.data.characterType;
    if (!characterType || !characters.includes(characterType as any)) {
      // 완성된 캐릭터 타입 조회 (중복 보유 가능하므로 갯수와 무관, 아직 안 한 것 우선)
      const completedRes = await docClient.send(new QueryCommand({
        TableName: process.env.CHARACTERS_TABLE!,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :uid',
        FilterExpression: 'mythologyLine = :ml AND #st = :complete',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':uid': userId, ':ml': targetMythology, ':complete': 'complete' },
        ProjectionExpression: 'characterType',
      }));
      const completedTypes = new Set((completedRes.Items ?? []).map((c: any) => c.characterType));
      characterType = characters.find(c => !completedTypes.has(c)) ?? characters[0];
    }

    const characterId = uuidv4();
    const now = new Date().toISOString();

    await docClient.send(new PutCommand({
      TableName: process.env.CHARACTERS_TABLE!,
      Item: {
        characterId,
        userId,
        mythologyLine: targetMythology,
        characterType,
        slots: [],
        filledCount: 0,
        status: 'in_progress',
        createdAt: now,
      },
      ConditionExpression: 'attribute_not_exists(characterId)',
    }));

    await docClient.send(new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      UpdateExpression: 'SET activeMythology = :m, activeCharacterId = :c, updatedAt = :now',
      ExpressionAttributeValues: { ':m': targetMythology, ':c': characterId, ':now': now },
    }));

    return response(200, {
      success: true,
      data: { characterId, mythologyLine: targetMythology, characterType, filledCount: 0, totalSlots: SLOTS_PER_CHARACTER },
    });
  } catch (err) {
    console.error('[character/next] error:', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
