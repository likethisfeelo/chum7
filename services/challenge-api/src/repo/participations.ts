/**
 * challenges 테이블 — 참여(user-challenge) (키 설계: 이전 가이드 §3 challenges).
 *  pk=`CHAL#<challengeId>`, sk=`UC#<userId>`
 *  gsi1pk=`UCUSER#<userId>`, gsi1sk=`<createdAt>` (내 챌린지)
 * 레거시 USER_CHALLENGES_TABLE(PK userChallengeId + userId-index/challengeId-index/groupId-index) 대응.
 * userChallengeId는 속성으로 유지 (응답 계약) — 조회는 (challengeId,userId) 또는 gsi1 Query.
 */
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './shared';

const ucSk = (userId: string) => `UC#${userId}`;

export function participationKeys(challengeId: string, userId: string, createdAt: string) {
  return {
    pk: challengePk(challengeId),
    sk: ucSk(userId),
    gsi1pk: `UCUSER#${userId}`,
    gsi1sk: createdAt,
  };
}

export async function getParticipation(
  challengeId: string,
  userId: string,
): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: ucSk(userId) },
    }),
  );
  return res.Item;
}

/** put — 재참여(기존 failed 레코드 덮어쓰기) 허용 여부는 호출자가 검사 */
export async function putParticipation(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

/** 내 챌린지 목록 — gsi1pk=UCUSER#<userId> Query (레거시 userId-index 대응) */
export async function listMyParticipations(userId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': `UCUSER#${userId}` },
        ScanIndexForward: false, // 최신순 (레거시 승계)
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** userChallengeId로 본인 참여 조회 — 요청 바디 계약(userChallengeId) 유지용 (본인 파티션 Query라 소유권 내장) */
export async function findMyParticipationByUcId(
  userId: string,
  userChallengeId: string,
): Promise<Record<string, any> | undefined> {
  const items = await listMyParticipations(userId);
  return items.find((item) => item.userChallengeId === userChallengeId);
}

/** 챌린지 참여자 전체 — pk 파티션 UC# prefix Query (레거시 challengeId-index/groupId-index 대응) */
export async function listChallengeParticipations(challengeId: string): Promise<Record<string, any>[]> {
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

/**
 * 응원/감사 점수 누적 증분 — 참여 UC# 아이템에 ADD (레거시 USER_CHALLENGES cheerScore/thankScore ADD 승계).
 * 인증 제출 시 조기완료·전원완료·수신자완료 분기에서 발신자/수신자 점수를 적립한다.
 * 참여 레코드가 없으면(비정상) 조용히 스킵.
 */
export async function addParticipationScores(
  challengeId: string,
  userId: string,
  deltas: { cheerScore?: number; thankScore?: number; cheerCount?: number },
  nowIso: string,
): Promise<void> {
  const adds: string[] = [];
  const values: Record<string, unknown> = { ':now': nowIso };
  if (deltas.cheerScore) {
    adds.push('cheerScore :cs');
    values[':cs'] = deltas.cheerScore;
  }
  if (deltas.thankScore) {
    adds.push('thankScore :ts');
    values[':ts'] = deltas.thankScore;
  }
  if (deltas.cheerCount) {
    adds.push('cheerCount :cc');
    values[':cc'] = deltas.cheerCount;
  }
  if (adds.length === 0) return;
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: challengePk(challengeId), sk: ucSk(userId) },
        UpdateExpression: `ADD ${adds.join(', ')} SET updatedAt = :now`,
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: values,
      }),
    );
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return; // 참여 없음 — 점수 적립만 생략
    throw err;
  }
}

/** 참여 레코드 부분 갱신 (reserved word 대응 dynamic SET) */
export async function updateParticipationFields(
  challengeId: string,
  userId: string,
  attrs: Record<string, unknown>,
  condition?: { expression: string; names?: Record<string, string>; values?: Record<string, unknown> },
): Promise<void> {
  const names: Record<string, string> = { ...(condition?.names ?? {}) };
  const values: Record<string, unknown> = { ...(condition?.values ?? {}) };
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
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: ucSk(userId) },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...(condition ? { ConditionExpression: condition.expression } : {}),
    }),
  );
}
