/**
 * challenges 테이블 — 퀘스트 제출물 심사 액세스 (challenge-api repo/quests.ts 키 패턴 복사).
 *  퀘스트:        pk=`CHAL#<id>`/sk=`QUEST#<questId>`
 *  제출 이력:     sk=`QSUB#<questId>#<userId>#<ts>` (recordType='history', gsi1 QSUBUSER#)
 *  ACTIVE 마커:   sk=`QSUB#<questId>#<userId>#ACTIVE` (recordType='active', user+quest당 1건)
 * 거절 시 ACTIVE 마커를 DELETE → 재제출 허용 (challenge-api PORTING.md §C 계약).
 */
import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './challenges';

const questSk = (questId: string) => `QUEST#${questId}`;
const activeSubSk = (questId: string, userId: string) => `QSUB#${questId}#${userId}#ACTIVE`;

/** 챌린지의 퀘스트 목록 — pk 파티션 QUEST# Query */
export async function listQuests(challengeId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :q)',
        ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':q': 'QUEST#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 챌린지의 제출물 전체 (이력 + ACTIVE 마커) — pk 파티션 QSUB# Query */
export async function listChallengeSubmissions(challengeId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :q)',
        ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':q': 'QSUB#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** submissionId로 이력 아이템 탐색 — 챌린지 파티션 내 필터 (신규 키에서 단독 Get 불가) */
export async function findSubmissionById(
  challengeId: string,
  submissionId: string,
): Promise<Record<string, any> | undefined> {
  const items = await listChallengeSubmissions(challengeId);
  return items.find((item) => item.recordType === 'history' && item.submissionId === submissionId);
}

export function isTransactionConditionFailed(error: any): boolean {
  if (error?.name === 'ConditionalCheckFailedException') return true;
  if (error?.name !== 'TransactionCanceledException') return false;
  const reasons = error?.CancellationReasons;
  return Array.isArray(reasons) && reasons.some((r: any) => r?.Code === 'ConditionalCheckFailed');
}

export interface ReviewTransactionInput {
  challengeId: string;
  questId: string;
  userId: string;
  /** 이력 아이템의 sk (`QSUB#<questId>#<userId>#<ts>`) */
  historySk: string;
  reviewerId: string;
  reviewNote: string | null;
  nowIso: string;
}

/**
 * 승인 트랜잭션 (레거시 quest/approve 승계):
 *  ① 이력 status='approved' + rewardGranted (pending 조건)
 *  ② ACTIVE 마커 status='approved' 유지 → 재제출 차단
 *  ③ 퀘스트 approvedCount += 1
 */
export async function approveSubmissionTransaction(input: ReviewTransactionInput): Promise<void> {
  const pk = challengePk(input.challengeId);
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName(TABLE),
            Key: { pk, sk: input.historySk },
            UpdateExpression:
              'SET #st = :status, rewardGranted = :reward, reviewNote = :note, reviewedBy = :reviewer, reviewedAt = :now',
            ConditionExpression: '#st = :pending',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':status': 'approved',
              ':pending': 'pending',
              ':reward': true,
              ':note': input.reviewNote,
              ':reviewer': input.reviewerId,
              ':now': input.nowIso,
            },
          },
        },
        {
          Update: {
            TableName: tableName(TABLE),
            Key: { pk, sk: activeSubSk(input.questId, input.userId) },
            UpdateExpression: 'SET #st = :status, updatedAt = :now',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: { ':status': 'approved', ':now': input.nowIso },
          },
        },
        {
          Update: {
            TableName: tableName(TABLE),
            Key: { pk, sk: questSk(input.questId) },
            UpdateExpression:
              'SET approvedCount = if_not_exists(approvedCount, :zero) + :inc, updatedAt = :now',
            ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': input.nowIso },
          },
        },
      ],
    }),
  );
}

/**
 * 거절 트랜잭션 (레거시 quest/approve reject 분기 승계):
 *  ① 이력 status='rejected' (pending 조건)
 *  ② ACTIVE 유니크 마커 DELETE → 재제출 허용
 */
export async function rejectSubmissionTransaction(input: ReviewTransactionInput): Promise<void> {
  const pk = challengePk(input.challengeId);
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName(TABLE),
            Key: { pk, sk: input.historySk },
            UpdateExpression:
              'SET #st = :status, rewardGranted = :reward, reviewNote = :note, reviewedBy = :reviewer, reviewedAt = :now',
            ConditionExpression: '#st = :pending',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':status': 'rejected',
              ':pending': 'pending',
              ':reward': false,
              ':note': input.reviewNote,
              ':reviewer': input.reviewerId,
              ':now': input.nowIso,
            },
          },
        },
        {
          Delete: {
            TableName: tableName(TABLE),
            Key: { pk, sk: activeSubSk(input.questId, input.userId) },
          },
        },
      ],
    }),
  );
}

/** 퀘스트 생성 — 레거시 quest/create 아이템 형태 + 신규 키 (중복 questId 방지 조건부) */
export async function putQuest(quest: Record<string, unknown> & { challengeId: string; questId: string }): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: { pk: challengePk(quest.challengeId), sk: questSk(quest.questId), ...quest },
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );
}

/** 퀘스트 필드 수정 — 존재 조건부 부분 업데이트 */
export async function updateQuestFields(
  challengeId: string,
  questId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const keys = Object.keys(patch);
  if (keys.length === 0) return true;
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: challengePk(challengeId), sk: questSk(questId) },
        UpdateExpression: 'SET ' + keys.map((_, i) => `#k${i} = :v${i}`).join(', '),
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeNames: Object.fromEntries(keys.map((k, i) => [`#k${i}`, k])),
        ExpressionAttributeValues: Object.fromEntries(keys.map((k, i) => [`:v${i}`, patch[k] ?? null])),
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

/** 단일 퀘스트 조회 */
export async function getQuestItem(
  challengeId: string,
  questId: string,
): Promise<Record<string, any> | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: challengePk(challengeId), sk: questSk(questId) } }),
  );
  return result.Item as Record<string, any> | undefined;
}
