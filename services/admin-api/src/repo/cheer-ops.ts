/**
 * cheer 테이블 — 데드레터/모니터 운영 액세스 (키 설계: 이전 가이드 §3 cheer,
 * cheer-api repo/shared.ts + cheer-scheduler buildDeadLetterItem 키 빌더 복사).
 *  응원 META:  pk=`CHEER#<cheerId>`/sk=`META`, 예약분 gsi2pk=`SCHED#<status>`/gsi2sk=`<scheduledTime>`
 *  데드레터:   pk=`DLQ#<cheerId>`/sk=`META`(ttl), gsi2pk=`DLQ#<YYYY-MM-DD>`/gsi2sk=`<failedAt>`
 * 재처리 시 응원 META의 SCHED gsi2를 pending으로 되돌려 cheer-scheduler가 다시 집도록 한다.
 */
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const TABLE = 'CHEER_TABLE';
const META_SK = 'META';

export const cheerPk = (cheerId: string) => `CHEER#${cheerId}`;
export const dlqPk = (cheerId: string) => `DLQ#${cheerId}`;
export const dlqDayGsi2Pk = (date: string) => `DLQ#${date}`;
export const schedGsi2Pk = (status: string) => `SCHED#${status}`;

export async function getDeadLetter(cheerId: string): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: dlqPk(cheerId), sk: META_SK } }),
  );
  return res.Item;
}

export async function getCheerMeta(cheerId: string): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: cheerPk(cheerId), sk: META_SK } }),
  );
  return res.Item;
}

export interface DlqDayQueryInput {
  date: string;
  /** 'dead' | 'requeued' — 미지정 시 전체 */
  status?: string;
  failureCode?: string;
  /** failedAt 범위 (gsi2sk BETWEEN) */
  fromIso?: string;
  toIso?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
}

/** 일자 파티션 데드레터 조회 — gsi2 DLQ#<date> failedAt 최신순 */
export async function queryDeadLettersByDay(
  input: DlqDayQueryInput,
): Promise<{ items: Record<string, any>[]; lastKey?: Record<string, any> }> {
  const filters: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':pk': dlqDayGsi2Pk(input.date) };

  let keyCondition = 'gsi2pk = :pk';
  if (input.fromIso && input.toIso) {
    keyCondition += ' AND gsi2sk BETWEEN :from AND :to';
    values[':from'] = input.fromIso;
    values[':to'] = input.toIso;
  }
  if (input.status) {
    filters.push('#st = :status');
    names['#st'] = 'status';
    values[':status'] = input.status;
  }
  if (input.failureCode) {
    filters.push('failureCode = :failureCode');
    values[':failureCode'] = input.failureCode;
  }

  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi2',
      KeyConditionExpression: keyCondition,
      FilterExpression: filters.length > 0 ? filters.join(' AND ') : undefined,
      ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
      ExpressionAttributeValues: values,
      ScanIndexForward: false,
      Limit: input.limit,
      ExclusiveStartKey: input.exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** 일자 파티션 status별 COUNT (stats — 페이지 순회) */
export async function countDlqByDay(input: {
  date: string;
  status: string;
  fromIso: string;
  toIso: string;
}): Promise<number> {
  let count = 0;
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pk AND gsi2sk BETWEEN :from AND :to',
        FilterExpression: '#st = :status',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':pk': dlqDayGsi2Pk(input.date),
          ':from': input.fromIso,
          ':to': input.toIso,
          ':status': input.status,
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

/** SCHED#<status> 파티션 최신 N건 (cheer monitor — 레거시 scheduled-index 대응) */
export async function listCheersBySchedStatus(status: string, limit: number): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi2',
      KeyConditionExpression: 'gsi2pk = :pk',
      ExpressionAttributeValues: { ':pk': schedGsi2Pk(status) },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return res.Items ?? [];
}

export function isRequeueConflict(error: any): boolean {
  return error?.name === 'ConditionalCheckFailedException' || error?.name === 'TransactionCanceledException';
}

/**
 * 재처리 트랜잭션 (레거시 requeue 승계 + 신규 SCHED gsi2 동기):
 *  ① 응원 META → pending, retryCount 0, scheduledTime now+60s, gsi2 SCHED#pending 복구,
 *     실패 필드 REMOVE (원본 존재 조건)
 *  ② DLQ 아이템 → requeued (status='dead' 조건)
 */
export async function requeueTransaction(input: {
  cheerId: string;
  actorId: string;
  nowIso: string;
  scheduledTime: string;
}): Promise<void> {
  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName(TABLE),
            Key: { pk: cheerPk(input.cheerId), sk: META_SK },
            UpdateExpression:
              'SET #st = :pending, retryCount = :retryCount, scheduledTime = :scheduledTime, ' +
              'nextRetryAt = :nextRetryAt, requeuedAt = :requeuedAt, gsi2pk = :gsi2pk, gsi2sk = :gsi2sk ' +
              'REMOVE deadLetterReason, failureCode, failedAt',
            ConditionExpression: 'attribute_exists(pk)',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':pending': 'pending',
              ':retryCount': 0,
              ':scheduledTime': input.scheduledTime,
              ':nextRetryAt': input.scheduledTime,
              ':requeuedAt': input.nowIso,
              ':gsi2pk': schedGsi2Pk('pending'),
              ':gsi2sk': input.scheduledTime,
            },
          },
        },
        {
          Update: {
            TableName: tableName(TABLE),
            Key: { pk: dlqPk(input.cheerId), sk: META_SK },
            UpdateExpression: 'SET #st = :status, requeuedAt = :requeuedAt, requeuedBy = :requeuedBy',
            ConditionExpression: '#st = :dead',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':status': 'requeued',
              ':requeuedAt': input.nowIso,
              ':requeuedBy': input.actorId,
              ':dead': 'dead',
            },
          },
        },
      ],
    }),
  );
}
