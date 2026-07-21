/**
 * lifecycle-manager 테이블 액세스.
 *  - challenges (CHALLENGES_TABLE) RW: META gsi1 Query·전이, UC# 파티션 Query·갱신
 *    (키 설계: 이전 가이드 §3 challenges — challenge-api repo와 동일 규칙)
 *  - gamification (GAMIFICATION_TABLE) W(+판정용 R): 뱃지 조건부 Put, 캐릭터 슬롯 갱신
 *    (문서화된 크로스 도메인 예외 — 이전 가이드 §4 워커)
 */
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import type { CharacterRecord } from './domain/character-slot';

const CHALLENGES_TABLE = 'CHALLENGES_TABLE';
const GAMIFICATION_TABLE = 'GAMIFICATION_TABLE';

const challengePk = (challengeId: string) => `CHAL#${challengeId}`;
export const challengeGsi1Pk = (lifecycle: string, category: string) => `LC#${lifecycle}#CAT#${category}`;

// ── challenges: META ───────────────────────────────────────────────────

/** lifecycle×category 파티션의 챌린지 META 전체 (gsi1 Query — 풀스캔 금지) */
export async function listChallengesByLifecycleCategory(
  lifecycle: string,
  category: string,
): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(CHALLENGES_TABLE),
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': challengeGsi1Pk(lifecycle, category) },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/**
 * lifecycle 전이 — META 갱신 + gsi1pk 동기화 (조건부: 현재 lifecycle=from — 레거시 race 방지 승계).
 * active 진입 시 actualStartAt(if_not_exists)·challengeEndAt도 함께 기록 (레거시 syncChallengeScheduleOnActivation).
 */
export async function transitionChallenge(input: {
  challengeId: string;
  category: string;
  from: string;
  to: string;
  nowIso: string;
  activation?: { actualStartAt: string; challengeEndAt: string };
}): Promise<void> {
  const sets = ['lifecycle = :to', 'gsi1pk = :gsi1pk', 'updatedAt = :now'];
  const values: Record<string, unknown> = {
    ':from': input.from,
    ':to': input.to,
    ':gsi1pk': challengeGsi1Pk(input.to, input.category),
    ':now': input.nowIso,
  };
  if (input.activation) {
    sets.push('actualStartAt = if_not_exists(actualStartAt, :actualStartAt)');
    sets.push('challengeEndAt = :challengeEndAt');
    values[':actualStartAt'] = input.activation.actualStartAt;
    values[':challengeEndAt'] = input.activation.challengeEndAt;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(CHALLENGES_TABLE),
      Key: { pk: challengePk(input.challengeId), sk: 'META' },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: 'lifecycle = :from',
      ExpressionAttributeValues: values,
    }),
  );
}

/** 자동 거절분 stats.pendingParticipants 감소 (0 미만 방지 조건 — challenge-api adjustChallengeStats 승계) */
export async function decrementPendingParticipants(
  challengeId: string,
  count: number,
  nowIso: string,
): Promise<void> {
  if (count <= 0) return;
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(CHALLENGES_TABLE),
        Key: { pk: challengePk(challengeId), sk: 'META' },
        UpdateExpression:
          'SET stats.pendingParticipants = if_not_exists(stats.pendingParticipants, :zero) - :count, updatedAt = :now',
        ConditionExpression: 'if_not_exists(stats.pendingParticipants, :zero) >= :count',
        ExpressionAttributeValues: { ':zero': 0, ':count': count, ':now': nowIso },
      }),
    );
  } catch (err: any) {
    if (err?.name !== 'ConditionalCheckFailedException') throw err;
  }
}

/** 리더의 완료 챌린지 목록 — gsi2 CREATOR#<userId> Query (레거시 createdBy-index 대응) */
export async function listCompletedChallengesByCreator(
  creatorId: string,
): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(CHALLENGES_TABLE),
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pk',
        FilterExpression: 'lifecycle = :completed',
        ExpressionAttributeValues: { ':pk': `CREATOR#${creatorId}`, ':completed': 'completed' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ── challenges: 참여(UC#) ──────────────────────────────────────────────

/** 챌린지 참여자 전체 — pk 파티션 UC# prefix Query (레거시 challengeId-index 대응) */
export async function listParticipations(challengeId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(CHALLENGES_TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :uc)',
        ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':uc': 'UC#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 참여 레코드 부분 갱신 (예약어 대응 dynamic SET) */
export async function updateParticipation(
  challengeId: string,
  userId: string,
  attrs: Record<string, unknown>,
): Promise<void> {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  let i = 0;
  for (const [key, value] of Object.entries(attrs)) {
    i += 1;
    names[`#u${i}`] = key;
    values[`:u${i}`] = value;
    sets.push(`#u${i} = :u${i}`);
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(CHALLENGES_TABLE),
      Key: { pk: challengePk(challengeId), sk: `UC#${userId}` },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

// ── gamification: 뱃지·캐릭터 (크로스 도메인 W — 이전 가이드 §4) ─────────

/**
 * 뱃지 조건부 Put — attribute_not_exists(pk)로 중복 부여 방지
 * (레거시 attribute_not_exists(badgeId) AND attribute_not_exists(userId) 대응).
 * @returns true = 신규 부여, false = 이미 보유
 */
export async function putBadgeIfAbsent(item: Record<string, unknown>): Promise<boolean> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(GAMIFICATION_TABLE),
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/** 캐릭터 상태 아이템 (pk=USER#<id>, sk=CHARACTER — gamification-api repo/characters 동일 키) */
export async function getCharacterState(userId: string): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(GAMIFICATION_TABLE),
      Key: { pk: `USER#${userId}`, sk: 'CHARACTER' },
    }),
  );
  return res.Item;
}

export async function getCharacter(
  userId: string,
  characterId: string,
): Promise<CharacterRecord | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(GAMIFICATION_TABLE),
      Key: { pk: `USER#${userId}`, sk: `CHAR#${characterId}` },
    }),
  );
  return res.Item as CharacterRecord | undefined;
}

/** 내 캐릭터 전체 (세계관 완성 판정용 — pk + begins_with CHAR#) */
export async function listCharacters(userId: string): Promise<CharacterRecord[]> {
  const items: CharacterRecord[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(GAMIFICATION_TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'CHAR#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((res.Items ?? []) as CharacterRecord[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 캐릭터/상태 아이템 부분 갱신 (예약어 대응 dynamic SET — gamification-api repo 패턴) */
export async function updateGamificationItem(
  userId: string,
  sk: string,
  attrs: Record<string, unknown>,
): Promise<void> {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets = Object.entries(attrs).map(([key, value], i) => {
    names[`#a${i}`] = key;
    values[`:v${i}`] = value;
    return `#a${i} = :v${i}`;
  });
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(GAMIFICATION_TABLE),
      Key: { pk: `USER#${userId}`, sk },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/** pendingSlotFills 누적 (활성 캐릭터 없음 — 다음 캐릭터 선택 시 소급) */
export async function incrementPendingSlotFills(userId: string, nowIso: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(GAMIFICATION_TABLE),
      Key: { pk: `USER#${userId}`, sk: 'CHARACTER' },
      UpdateExpression:
        'SET pendingSlotFills = if_not_exists(pendingSlotFills, :zero) + :one, updatedAt = :now',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':now': nowIso },
    }),
  );
}
