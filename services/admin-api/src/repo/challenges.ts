/**
 * challenges 테이블 — 어드민 챌린지 운영 액세스 (키 설계: 이전 가이드 §3 challenges,
 * challenge-api repo/{challenges,participations}.ts 키 빌더 복사 — 서비스 간 import 금지).
 *  챌린지: pk=`CHAL#<id>`/sk=`META`, gsi1pk=`LC#<lifecycle>#CAT#<category>`/gsi1sk=`<challengeStartAt>`,
 *          gsi2pk=`CREATOR#<userId>`/gsi2sk=`<createdAt>`
 *  참여:   pk=`CHAL#<id>`/sk=`UC#<userId>`
 *  공개 인증 집계: gsi2pk=`VFPUB#<YYYY-MM-DD>`(KST)
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

export const TABLE = 'CHALLENGES_TABLE';
const SK_META = 'META';

export const CHALLENGE_CATEGORIES = [
  'health', 'habit', 'development', 'creativity', 'relationship', 'mindfulness', 'expand', 'impact',
] as const;

export const CHALLENGE_LIFECYCLES = [
  'draft', 'recruiting', 'preparing', 'active', 'completed', 'archived',
] as const;

export const challengePk = (challengeId: string) => `CHAL#${challengeId}`;
const ucSk = (userId: string) => `UC#${userId}`;

export function challengeGsi1Pk(lifecycle: string, category: string): string {
  return `LC#${lifecycle}#CAT#${category}`;
}

export function challengeKeys(item: {
  challengeId: string;
  lifecycle: string;
  category: string;
  challengeStartAt: string;
  createdBy: string;
  createdAt: string;
}) {
  return {
    pk: challengePk(item.challengeId),
    sk: SK_META,
    gsi1pk: challengeGsi1Pk(item.lifecycle, item.category),
    gsi1sk: item.challengeStartAt,
    gsi2pk: `CREATOR#${item.createdBy}`,
    gsi2sk: item.createdAt,
  };
}

export async function getChallenge(challengeId: string): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: challengePk(challengeId), sk: SK_META } }),
  );
  return res.Item;
}

export async function putChallenge(item: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: tableName(TABLE), Item: item, ConditionExpression: 'attribute_not_exists(pk)' }),
  );
}

export async function deleteChallengeMeta(challengeId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: challengePk(challengeId), sk: SK_META } }),
  );
}

/**
 * 챌린지 부분 갱신 — lifecycle/category/challengeStartAt 변경 시 gsi1 키 동기 유지.
 * (challenge-api updateChallengeFields 동형)
 */
export async function updateChallengeFields(
  challengeId: string,
  attrs: Record<string, unknown>,
  gsiSync?: { lifecycle: string; category: string; challengeStartAt: string },
): Promise<void> {
  const merged = { ...attrs };
  if (gsiSync) {
    const lifecycle = (attrs.lifecycle as string) ?? gsiSync.lifecycle;
    const category = (attrs.category as string) ?? gsiSync.category;
    const challengeStartAt = (attrs.challengeStartAt as string) ?? gsiSync.challengeStartAt;
    merged.gsi1pk = challengeGsi1Pk(lifecycle, category);
    merged.gsi1sk = challengeStartAt;
  }

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  let i = 0;
  for (const [key, value] of Object.entries(merged)) {
    i += 1;
    names[`#f${i}`] = key;
    values[`:v${i}`] = value;
    sets.push(`#f${i} = :v${i}`);
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: SK_META },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/** confirm-start 전용 조건부 전환 — preparing → active (레거시 ConditionExpression 승계) */
export async function confirmStartTransition(
  challengeId: string,
  input: { nowIso: string; endAt: string; confirmedBy: string; category: string; challengeStartAt: string },
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: SK_META },
      UpdateExpression:
        'SET lifecycle = :active, startConfirmedAt = :now, startConfirmedBy = :by, ' +
        'actualStartAt = if_not_exists(actualStartAt, :now), challengeEndAt = :endAt, updatedAt = :now, gsi1pk = :gsi1pk',
      ConditionExpression: 'lifecycle = :preparing',
      ExpressionAttributeValues: {
        ':active': 'active',
        ':preparing': 'preparing',
        ':now': input.nowIso,
        ':endAt': input.endAt,
        ':by': input.confirmedBy,
        ':gsi1pk': challengeGsi1Pk('active', input.category),
      },
    }),
  );
}

/** 참여자 존재 여부 — pk 파티션 UC# Limit 1 (레거시 challengeId-index Limit 1 대응) */
export async function hasParticipants(challengeId: string): Promise<boolean> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :uc)',
      ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':uc': 'UC#' },
      Limit: 1,
    }),
  );
  return (res.Items ?? []).length > 0;
}

/** 챌린지 참여 전체 — pk 파티션 UC# Query (confirm-start side effect용) */
export async function listParticipations(challengeId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
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

/** 참여 아이템 부분 갱신 ('status' 등 예약어 안전 처리) */
export async function updateParticipationFields(
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
    names[`#f${i}`] = key;
    values[`:v${i}`] = value;
    sets.push(`#f${i} = :v${i}`);
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: ucSk(userId) },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/** stats.pendingParticipants 감소 (레거시 confirm-start 승계) */
export async function decrementPendingParticipants(challengeId: string, count: number, nowIso: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: SK_META },
      UpdateExpression:
        'SET stats.pendingParticipants = if_not_exists(stats.pendingParticipants, :zero) - :count, updatedAt = :now',
      ExpressionAttributeValues: { ':zero': 0, ':count': count, ':now': nowIso },
    }),
  );
}

/** 내가 만든 챌린지 — gsi2 CREATOR# Query (레거시 list-mine Scan 재작성) */
export async function listByCreator(userId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pk',
        ExpressionAttributeValues: { ':pk': `CREATOR#${userId}` },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/**
 * 전체 챌린지 — 레거시 list-all Scan을 gsi1 (lifecycle × category) 파티션 병렬 Query로 재작성.
 * 파티션당 limitPerPartition 첫 페이지만 (레거시도 Limit 500 슬라이스만 지원).
 */
export async function listAllByPartitions(
  lifecycles: readonly string[],
  limitPerPartition = 100,
): Promise<Record<string, any>[]> {
  const partitions: string[] = [];
  for (const lifecycle of lifecycles) {
    for (const category of CHALLENGE_CATEGORIES) {
      partitions.push(challengeGsi1Pk(lifecycle, category));
    }
  }
  const results = await Promise.all(
    partitions.map((pkValue) =>
      docClient.send(
        new QueryCommand({
          TableName: tableName(TABLE),
          IndexName: 'gsi1',
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: { ':pk': pkValue },
          ScanIndexForward: false,
          Limit: limitPerPartition,
        }),
      ),
    ),
  );
  return results.flatMap((r) => r.Items ?? []);
}

/** lifecycle×category 파티션 COUNT 합산 — 스캔 없는 전체 챌린지 수 (stats overview v1) */
export async function countAllChallenges(): Promise<number> {
  const partitions: string[] = [];
  for (const lifecycle of CHALLENGE_LIFECYCLES) {
    for (const category of CHALLENGE_CATEGORIES) {
      partitions.push(challengeGsi1Pk(lifecycle, category));
    }
  }
  const results = await Promise.all(
    partitions.map((pkValue) =>
      docClient.send(
        new QueryCommand({
          TableName: tableName(TABLE),
          IndexName: 'gsi1',
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: { ':pk': pkValue },
          Select: 'COUNT',
        }),
      ),
    ),
  );
  return results.reduce((sum, r) => sum + (r.Count ?? 0), 0);
}

/** 공개 인증 일자별 COUNT — gsi2 VFPUB#<YYYY-MM-DD>(KST) (stats overview v1, 공개 인증만) */
export async function countPublicVerificationsByDate(date: string): Promise<number> {
  let count = 0;
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pk',
        ExpressionAttributeValues: { ':pk': `VFPUB#${date}` },
        Select: 'COUNT',
        ExclusiveStartKey: lastKey,
      }),
    );
    count += res.Count ?? 0;
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return count;
}
