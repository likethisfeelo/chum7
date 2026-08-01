/**
 * challenges 테이블 — 퀘스트/퀘스트 제출 (키 설계: 이전 가이드 §3 challenges).
 *  퀘스트:      pk=`CHAL#<challengeId>`, sk=`QUEST#<questId>`
 *  퀘스트 제출: pk=`CHAL#<challengeId>`, sk=`QSUB#<questId>#<userId>#<ts>` (append-only 이력, recordType='history')
 *               + sk=`QSUB#<questId>#<userId>#ACTIVE` (현재 상태 마커, recordType='active')
 *               이력 아이템만 gsi1pk=`QSUBUSER#<userId>`, gsi1sk=`<createdAt>` (내 제출 조회)
 * 레거시 2-테이블 패턴(questSubmissions + activeQuestSubmissions)을 단일 테이블 내
 * 이력 아이템 + ACTIVE 마커(조건부 put으로 user+quest당 활성 제출 1건 보장)로 재구성.
 */
import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './shared';

const questSk = (questId: string) => `QUEST#${questId}`;

/**
 * 퀘스트 생성 — pk=`CHAL#<challengeId>`, sk=`QUEST#<questId>`.
 * 리더 운영탭에서 공통 리더퀘스트 등록 시 사용 (admin-api putQuest 대응, 챌린지 스코프 게이트는 라우트에서).
 * questId 중복 방지를 위해 sk 미존재 조건부 put.
 */
export async function putQuest(challengeId: string, quest: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: { ...quest, pk: challengePk(challengeId), sk: questSk(quest.questId) },
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
}
const activeSubSk = (questId: string, userId: string) => `QSUB#${questId}#${userId}#ACTIVE`;
const historySubSk = (questId: string, userId: string, ts: string) => `QSUB#${questId}#${userId}#${ts}`;

export async function getQuest(
  challengeId: string,
  questId: string,
): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: questSk(questId) },
    }),
  );
  return res.Item;
}

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

export async function getActiveSubmission(
  challengeId: string,
  questId: string,
  userId: string,
): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: activeSubSk(questId, userId) },
    }),
  );
  return res.Item;
}

/** 사용자 제출 이력 (특정 챌린지·퀘스트로 좁히기는 호출자 필터) — gsi1 QSUBUSER Query */
export async function listMyQuestSubmissions(userId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': `QSUBUSER#${userId}` },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export function isTransactionConditionFailed(error: any): boolean {
  if (error?.name !== 'TransactionCanceledException') return false;
  const reasons = error?.CancellationReasons;
  return Array.isArray(reasons) && reasons.some((r: any) => r?.Code === 'ConditionalCheckFailed');
}

/**
 * 퀘스트 제출 트랜잭션 (레거시 2-테이블 TransactWrite 승계):
 *  ① 이력 아이템 put (append-only)
 *  ② ACTIVE 마커 conditional put — 존재하지 않거나 직전 상태가 rejected일 때만 성공
 *     (레거시: rejected 시 active 레코드 DELETE → 재제출 가능. 단일 테이블에서는 rejected 마커 덮어쓰기로 동일 효과)
 *  ③ 퀘스트 submissionCount 증가
 */
export async function submitQuestTransaction(input: {
  challengeId: string;
  questId: string;
  userId: string;
  submission: Record<string, any>;
  now: string;
}): Promise<void> {
  const { challengeId, questId, userId, submission, now } = input;
  const pk = challengePk(challengeId);

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName(TABLE),
            Item: {
              ...submission,
              pk,
              sk: historySubSk(questId, userId, now),
              gsi1pk: `QSUBUSER#${userId}`,
              gsi1sk: now,
              recordType: 'history',
            },
          },
        },
        {
          Put: {
            TableName: tableName(TABLE),
            Item: {
              pk,
              sk: activeSubSk(questId, userId),
              recordType: 'active',
              activeSubmissionId: `${userId}#${questId}`,
              userId,
              questId,
              challengeId,
              submissionId: submission.submissionId,
              status: submission.status,
              createdAt: now,
              updatedAt: now,
            },
            ConditionExpression: 'attribute_not_exists(sk) OR #st = :rejected',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: { ':rejected': 'rejected' },
          },
        },
        {
          Update: {
            TableName: tableName(TABLE),
            Key: { pk, sk: questSk(questId) },
            UpdateExpression:
              'SET submissionCount = if_not_exists(submissionCount, :zero) + :inc, updatedAt = :now',
            ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': now },
          },
        },
      ],
    }),
  );
}

/** 챌린지의 대기(pending) 제출물 수 — ACTIVE 마커만 집계 (리더 브리핑용) */
export async function countPendingSubmissions(challengeId: string): Promise<number> {
  let count = 0;
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :q)',
        FilterExpression: 'recordType = :active AND #st = :pending',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':pk': challengePk(challengeId),
          ':q': 'QSUB#',
          ':active': 'active',
          ':pending': 'pending',
        },
        Select: 'COUNT',
        ExclusiveStartKey: lastKey,
      }),
    );
    count += res.Count ?? 0;
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return count;
}
