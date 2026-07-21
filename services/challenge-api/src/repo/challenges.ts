/**
 * challenges 테이블 — 챌린지 본문 (키 설계: 이전 가이드 §3 challenges).
 *  pk=`CHAL#<challengeId>`, sk=`META`
 *  gsi1pk=`LC#<lifecycle>#CAT#<category>`, gsi1sk=`<challengeStartAt>` (탐색)
 *  gsi2pk=`CREATOR#<userId>`, gsi2sk=`<createdAt>` (내가 만든 챌린지)
 * 레거시 CHALLENGES_TABLE(PK challengeId + Scan/createdBy-index) 대응 — 풀스캔 금지, Query만.
 */
import { BatchGetCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './shared';

const SK_META = 'META';

export const CHALLENGE_CATEGORIES = [
  'health', 'habit', 'development', 'creativity', 'relationship', 'mindfulness', 'expand', 'impact',
] as const;
export type ChallengeCategory = (typeof CHALLENGE_CATEGORIES)[number];

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
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: SK_META },
    }),
  );
  return res.Item;
}

export async function getChallengesBatch(challengeIds: string[]): Promise<Record<string, any>[]> {
  if (challengeIds.length === 0) return [];
  const items: Record<string, any>[] = [];
  // BatchGet 100건 제한 — 청크 처리
  for (let i = 0; i < challengeIds.length; i += 100) {
    const chunk = challengeIds.slice(i, i + 100);
    const res = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName(TABLE)]: {
            Keys: chunk.map((id) => ({ pk: challengePk(id), sk: SK_META })),
          },
        },
      }),
    );
    items.push(...(res.Responses?.[tableName(TABLE)] ?? []));
  }
  return items;
}

export async function putChallenge(item: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: item,
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );
}

/**
 * 챌린지 부분 갱신. lifecycle/category/challengeStartAt 변경 시 gsi1 키를 함께 유지한다.
 * gsiSync에 현재값 전달 필요 (변경분과 병합해 gsi1pk/gsi1sk 재계산).
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

/** 참여 통계 증감 (join/승인/거절). participantCount(탐색 인기순 정렬용 top-level 속성)도 함께 유지. */
export async function adjustChallengeStats(
  challengeId: string,
  delta: { total?: number; active?: number; pending?: number },
  now: string,
): Promise<void> {
  const sets: string[] = ['updatedAt = :now'];
  const values: Record<string, unknown> = { ':zero': 0, ':now': now };
  if (delta.total) {
    sets.push('stats.totalParticipants = if_not_exists(stats.totalParticipants, :zero) + :dTotal');
    sets.push('participantCount = if_not_exists(participantCount, :zero) + :dTotal');
    values[':dTotal'] = delta.total;
  }
  if (delta.active) {
    sets.push('stats.activeParticipants = if_not_exists(stats.activeParticipants, :zero) + :dActive');
    values[':dActive'] = delta.active;
  }
  if (delta.pending) {
    sets.push('stats.pendingParticipants = if_not_exists(stats.pendingParticipants, :zero) + :dPending');
    values[':dPending'] = delta.pending;
  }

  // 레거시 review 핸들러의 가드 승계: pending 감소는 0 미만으로 내려가지 않게 조건 걸기
  const pendingDecrement = delta.pending !== undefined && delta.pending < 0;
  if (pendingDecrement) {
    values[':absPending'] = Math.abs(delta.pending!);
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: SK_META },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeValues: values,
      ...(pendingDecrement
        ? { ConditionExpression: 'if_not_exists(stats.pendingParticipants, :zero) >= :absPending' }
        : {}),
    }),
  );
}

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

export interface DiscoveryQueryInput {
  lifecycles: string[];
  category?: string;
  /** recent: 시작일 최신순 / deadline: 시작 임박순 / popular: participantCount 인메모리 정렬(v1) */
  sortBy: 'recent' | 'deadline' | 'popular';
  limit: number;
}

/**
 * 탐색 Query — 레거시 Scan을 gsi1 파티션 Query로 재작성.
 * 카테고리 미지정 시 전체 카테고리 파티션을 각각 Query해 병합한다 (풀스캔 금지).
 * v1: 병합 페이지의 인메모리 정렬 (파티션별 첫 페이지 기준 — 레거시도 limit 슬라이스만 지원).
 */
export async function queryDiscovery(input: DiscoveryQueryInput): Promise<Record<string, any>[]> {
  const categories = input.category ? [input.category] : [...CHALLENGE_CATEGORIES];
  const partitions: string[] = [];
  for (const lifecycle of input.lifecycles) {
    for (const category of categories) {
      partitions.push(challengeGsi1Pk(lifecycle, category));
    }
  }

  const scanForward = input.sortBy === 'deadline'; // gsi1sk=challengeStartAt 오름차순 = 시작 임박순
  const results = await Promise.all(
    partitions.map((pkValue) =>
      docClient.send(
        new QueryCommand({
          TableName: tableName(TABLE),
          IndexName: 'gsi1',
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: { ':pk': pkValue },
          ScanIndexForward: scanForward,
          Limit: input.limit,
        }),
      ),
    ),
  );

  let merged = results.flatMap((r) => r.Items ?? []);
  // 조회 불가/비활성 챌린지 숨김 (레거시 공통 정책 승계)
  merged = merged.filter((item) => item?.isVisible !== false && item?.isActive !== false);

  if (input.sortBy === 'popular') {
    merged.sort((a, b) => (b.participantCount ?? b.stats?.totalParticipants ?? 0) - (a.participantCount ?? a.stats?.totalParticipants ?? 0));
  } else if (input.sortBy === 'deadline') {
    merged.sort((a, b) => String(a.gsi1sk ?? a.challengeStartAt ?? '').localeCompare(String(b.gsi1sk ?? b.challengeStartAt ?? '')));
  } else {
    merged.sort((a, b) => String(b.gsi1sk ?? b.challengeStartAt ?? '').localeCompare(String(a.gsi1sk ?? a.challengeStartAt ?? '')));
  }

  return merged.slice(0, input.limit);
}
