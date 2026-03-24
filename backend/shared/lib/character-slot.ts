import { GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  MYTHOLOGY_CHARACTERS,
  CHARACTER_META,
  MythologyLine,
  SLOTS_PER_CHARACTER,
} from './character-constants';
import { sendNotification } from './notification';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const MYTHOLOGY_NAME: Record<string, string> = {
  korean: '한국 신화',
  greek: '그리스 신화',
  norse: '북유럽 신화',
};

/**
 * 챌린지 완주 시 현재 진행 중인 캐릭터의 빈 슬롯을 하나 채운다.
 * 7개 다 채워지면 캐릭터를 완성 처리하고 세계관 완성 여부를 체크한다.
 */
export async function fillCharacterSlot(params: {
  userId: string;
  challengeId: string;
  usersTable: string;
  charactersTable: string;
}): Promise<void> {
  const { userId, challengeId, usersTable, charactersTable } = params;

  // 현재 활성 캐릭터 조회
  const userRes = await docClient.send(new GetCommand({
    TableName: usersTable,
    Key: { userId },
    ProjectionExpression: 'activeCharacterId, activeMythology, completedMythologies',
  }));
  const user = userRes.Item;
  if (!user?.activeCharacterId) return;

  const charRes = await docClient.send(new GetCommand({
    TableName: charactersTable,
    Key: { characterId: user.activeCharacterId },
  }));
  const char = charRes.Item;
  if (!char || char.status !== 'in_progress') return;

  const currentSlots: any[] = char.slots ?? [];
  if (currentSlots.length >= SLOTS_PER_CHARACTER) return; // 이미 가득 참

  const newSlot = {
    slotIndex: currentSlots.length,
    badgeId: uuidv4(),
    challengeId,
    filledAt: new Date().toISOString(),
  };
  const updatedSlots = [...currentSlots, newSlot];
  const newFilledCount = updatedSlots.length;
  const now = new Date().toISOString();

  if (newFilledCount >= SLOTS_PER_CHARACTER) {
    // 캐릭터 완성
    await docClient.send(new UpdateCommand({
      TableName: charactersTable,
      Key: { characterId: user.activeCharacterId },
      UpdateExpression: 'SET slots = :slots, filledCount = :count, #st = :complete, completedAt = :now',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: {
        ':slots': updatedSlots,
        ':count': newFilledCount,
        ':complete': 'complete',
        ':now': now,
      },
    }));

    // 캐릭터 완성 알림
    const meta = CHARACTER_META[char.characterType];
    const emoji = meta?.emoji ?? '✨';
    sendNotification({
      recipientId: userId,
      type: 'character_complete',
      title: `${emoji} ${char.characterType} 완성!`,
      body: `${MYTHOLOGY_NAME[char.mythologyLine] ?? char.mythologyLine}의 ${char.characterType}를 완성했어요. 다음 캐릭터를 선택해보세요!`,
      relatedId: user.activeCharacterId,
      relatedType: 'character',
    }).catch((err) => {
      console.error('[fillCharacterSlot] character_complete notification error:', err);
    });

    // 세계관 완성 여부 체크
    const mythologyCompleted = await checkMythologyCompletion({ userId, mythologyLine: char.mythologyLine, usersTable, charactersTable, now });

    // 세계관 완성 알림
    if (mythologyCompleted) {
      sendNotification({
        recipientId: userId,
        type: 'mythology_complete',
        title: `🎉 ${MYTHOLOGY_NAME[char.mythologyLine] ?? char.mythologyLine} 완성!`,
        body: `세계관의 모든 캐릭터를 완성했어요! 테마 스킨이 해금됐어요.`,
        relatedId: userId,
        relatedType: 'user',
      }).catch((err) => {
        console.error('[fillCharacterSlot] mythology_complete notification error:', err);
      });
    }

    // users.activeCharacterId 초기화 (다음 캐릭터 선택 대기)
    await docClient.send(new UpdateCommand({
      TableName: usersTable,
      Key: { userId },
      UpdateExpression: 'SET activeCharacterId = :null, updatedAt = :now',
      ExpressionAttributeValues: { ':null': null, ':now': now },
    }));
  } else {
    // 슬롯 추가
    await docClient.send(new UpdateCommand({
      TableName: charactersTable,
      Key: { characterId: user.activeCharacterId },
      UpdateExpression: 'SET slots = :slots, filledCount = :count',
      ExpressionAttributeValues: { ':slots': updatedSlots, ':count': newFilledCount },
    }));
  }
}

/** @returns 세계관이 새로 완성됐으면 true */
async function checkMythologyCompletion(params: {
  userId: string;
  mythologyLine: string;
  usersTable: string;
  charactersTable: string;
  now: string;
}): Promise<boolean> {
  const { userId, mythologyLine, usersTable, charactersTable, now } = params;

  const total = MYTHOLOGY_CHARACTERS[mythologyLine as MythologyLine]?.length;
  if (!total) return false;

  const completedRes = await docClient.send(new QueryCommand({
    TableName: charactersTable,
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'mythologyLine = :ml AND #st = :complete',
    ExpressionAttributeNames: { '#st': 'status' },
    ExpressionAttributeValues: { ':uid': userId, ':ml': mythologyLine, ':complete': 'complete' },
    Select: 'COUNT',
  }));

  const completedCount = completedRes.Count ?? 0;
  if (completedCount < total) return false;

  // 세계관 완성 — completedMythologies 배열에 추가 (중복 방지)
  try {
    await docClient.send(new UpdateCommand({
      TableName: usersTable,
      Key: { userId },
      UpdateExpression: 'SET completedMythologies = list_append(if_not_exists(completedMythologies, :empty), :ml), updatedAt = :now',
      ConditionExpression: 'not contains(completedMythologies, :mlStr)',
      ExpressionAttributeValues: {
        ':ml': [mythologyLine],
        ':mlStr': mythologyLine,
        ':empty': [] as string[],
        ':now': now,
      },
    }));
    return true; // 새로 완성됨
  } catch {
    return false; // 이미 포함된 경우 ConditionalCheckFailed — 중복이므로 false
  }
}
