/**
 * challenges 테이블 — 인증(verification) (키 설계: 이전 가이드 §3 challenges).
 *  pk=`CHAL#<challengeId>`, sk=`VF#<userId>#D<dd>#<verificationId>`
 *  gsi1pk=`VFUSER#<userId>`, gsi1sk=`<createdAt>` (내 인증)
 *  공개 인증: gsi2pk=`VFPUB#<YYYY-MM-DD>`(KST), gsi2sk=`<createdAt>` — 마당 변환·공개 피드·world-summary가 소비.
 * 레거시 VERIFICATIONS_TABLE(PK verificationId + userId-index/isPublic-createdAt-index) 대응.
 */
import { DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { certDateFromIso, DEFAULT_TIMEZONE } from '../domain/day-sync';
import { TABLE, challengePk } from './shared';

export function verificationSk(userId: string, day: number, verificationId: string): string {
  return `VF#${userId}#D${String(day).padStart(2, '0')}#${verificationId}`;
}

/**
 * 인증 아이템 키 빌드. isPublic(공개, isPersonalOnly 아님)일 때 반드시
 * gsi2pk=`VFPUB#<KST YYYY-MM-DD>` / gsi2sk=`<createdAt>`를 기록한다 (plaza-converter·world-summary 계약).
 */
export function verificationKeys(input: {
  challengeId: string;
  userId: string;
  day: number;
  verificationId: string;
  createdAt: string;
  isPublicFeed: boolean;
}) {
  const base = {
    pk: challengePk(input.challengeId),
    sk: verificationSk(input.userId, input.day, input.verificationId),
    gsi1pk: `VFUSER#${input.userId}`,
    gsi1sk: input.createdAt,
  };
  if (!input.isPublicFeed) return base;
  return {
    ...base,
    gsi2pk: `VFPUB#${certDateFromIso(input.createdAt, DEFAULT_TIMEZONE)}`,
    gsi2sk: input.createdAt,
  };
}

export async function putVerification(item: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: item,
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
}

export interface ListMineResult {
  items: Record<string, any>[];
  lastKey?: Record<string, any>;
}

/** 내 인증 목록 — gsi1 Query 최신순 (레거시 userId-index 대응) */
export async function listMyVerifications(
  userId: string,
  limit: number,
  startKey?: Record<string, any>,
): Promise<ListMineResult> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': `VFUSER#${userId}` },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: startKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** 공개 인증 피드 — gsi2 VFPUB#<KST date> Query 최신순 (레거시 isPublic-createdAt-index 대응) */
export async function listPublicVerificationsByDate(
  kstDate: string,
  limit: number,
  startKey?: Record<string, any>,
): Promise<ListMineResult> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi2',
      KeyConditionExpression: 'gsi2pk = :pk',
      ExpressionAttributeValues: { ':pk': `VFPUB#${kstDate}` },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: startKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** 특정 참여자의 챌린지 내 인증 전체 — pk 파티션 + sk `VF#<userId>#` prefix Query (리더 정리용) */
export async function listUserChallengeVerifications(
  challengeId: string,
  userId: string,
): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':sk': `VF#${userId}#` },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 인증 삭제 — 테이블 키(pk/sk)로 직접 삭제 (리더 개인 퀘스트 반려 시 인증 게시물 정리) */
export async function deleteVerification(keys: { pk: string; sk: string }): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: keys.pk, sk: keys.sk } }),
  );
}

/** verificationId로 본인 인증 조회 — 본인 gsi1 파티션 Query + 필터 (소유권 내장) */
export async function findMyVerificationById(
  userId: string,
  verificationId: string,
): Promise<Record<string, any> | undefined> {
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk',
        FilterExpression: 'verificationId = :vid',
        ExpressionAttributeValues: { ':pk': `VFUSER#${userId}`, ':vid': verificationId },
        ExclusiveStartKey: lastKey,
      }),
    );
    if (res.Items && res.Items.length > 0) return res.Items[0];
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return undefined;
}

/** 인증 부분 갱신 — 테이블 키(pk/sk)로 직접 갱신. gsi2 공개 키 추가 지원 (visibility 전환). */
export async function updateVerificationFields(
  keys: { pk: string; sk: string },
  attrs: Record<string, unknown>,
): Promise<void> {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  let i = 0;
  for (const [key, value] of Object.entries(attrs)) {
    i += 1;
    names[`#v${i}`] = key;
    values[`:v${i}`] = value;
    sets.push(`#v${i} = :v${i}`);
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: keys.pk, sk: keys.sk },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}
