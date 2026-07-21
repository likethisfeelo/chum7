/**
 * cheer-scheduler — 예약 응원 발송 워커 (EventBridge 5분 주기, plain Lambda handler).
 * 레거시 backend/services/cheer/send-scheduled 이식 + docs/cheer-latest.md §6:
 *   gsi2 SCHED#pending, scheduledTime <= now Query →
 *     수신자 day 완료   → status=receiver_completed + 발신자 참여에 thankScore ADD
 *     수신자 미완료     → status=sent + publishEvent('cheer.delivered')
 *     실패              → 백오프 재시도(1,5,15분), 초과 시 DLQ# 아이템(ttl) 이동
 *
 * 테이블: cheer(CHEER_TABLE, RW) + challenges(CHALLENGES_TABLE, READ + 발신자 thankScore ADD —
 * 문서화된 크로스 도메인 쓰기 예외, 이전 가이드 §4 / cheer-api PORTING.md §3).
 */
import type { EventBridgeEvent } from 'aws-lambda';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, publishEvent, tableName } from '@chum7/api-kit';
import {
  DEFAULT_MAX_RETRIES,
  buildDeadLetterItem,
  emptySummary,
  isReceiverDayCompleted,
  parseBackoffMinutes,
  planFailure,
} from './domain/send-decision';

const CHEER_TABLE = 'CHEER_TABLE';
const CHALLENGES_TABLE = 'CHALLENGES_TABLE';

function resolveMaxRetries(): number {
  const parsed = Number(process.env.CHEER_SCHEDULED_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_MAX_RETRIES;
}

/** 발송 기한 도래한 pending 예약 응원 — gsi2 SCHED#pending, scheduledTime <= now */
async function listDuePendingCheers(nowIso: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(CHEER_TABLE),
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pending AND gsi2sk <= :now',
        ExpressionAttributeValues: { ':pending': 'SCHED#pending', ':now': nowIso },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 수신자 day 완료 확인 — challenges READ-ONLY: CHAL#<challengeId>/UC#<receiverId> */
async function isReceiverCompleted(receiverId: string, challengeId: string, day: number): Promise<boolean> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(CHALLENGES_TABLE),
      Key: { pk: `CHAL#${challengeId}`, sk: `UC#${receiverId}` },
    }),
  );
  return isReceiverDayCompleted(res.Item, day);
}

/**
 * 수신자 완료 → 응원을 receiver_completed로 전이 + 발신자에게 thankScore 적립.
 * cheer 갱신의 ConditionalCheckFailedException은 호출부 race-skip으로 전파.
 */
async function grantThankScoreToSender(cheer: Record<string, any>, nowDate: Date): Promise<void> {
  const nowIso = nowDate.toISOString();

  // 1. cheer: status = receiver_completed, isThankScoreGranted = true (pending 조건부 — 레거시 승계)
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(CHEER_TABLE),
      Key: { pk: `CHEER#${cheer.cheerId}`, sk: 'META' },
      UpdateExpression:
        'SET #status = :done, isThankScoreGranted = :true, thankScoreGrantedAt = :now, gsi2pk = :gsi2pk',
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':done': 'receiver_completed',
        ':pending': 'pending',
        ':true': true,
        ':now': nowIso,
        ':gsi2pk': 'SCHED#receiver_completed',
      },
    }),
  );

  // 2. 발신자 참여: ADD thankScore :1 — challenges 크로스 도메인 쓰기 예외 (레거시 USER_CHALLENGES ADD 승계)
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(CHALLENGES_TABLE),
        Key: { pk: `CHAL#${cheer.challengeId}`, sk: `UC#${cheer.senderId}` },
        UpdateExpression: 'ADD thankScore :one SET updatedAt = :now',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: { ':one': 1, ':now': nowIso },
      }),
    );
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      // 발신자 참여 없음 — 레거시도 조용히 스킵 (점수 적립만 생략)
      console.warn(JSON.stringify({ level: 'warn', message: 'sender participation missing, thankScore skipped', cheerId: cheer.cheerId }));
      return;
    }
    throw error;
  }
}

/** 미완료 수신자 → 발송 처리 (pending 조건부) 후 cheer.delivered 이벤트 발행 */
async function markSentAndPublish(cheer: Record<string, any>, nowDate: Date): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(CHEER_TABLE),
      Key: { pk: `CHEER#${cheer.cheerId}`, sk: 'META' },
      UpdateExpression:
        'SET #status = :sent, sentAt = :sentAt, gsi2pk = :gsi2pk REMOVE nextRetryAt, failureCode, deadLetterReason',
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':pending': 'pending',
        ':sent': 'sent',
        ':sentAt': nowDate.toISOString(),
        ':gsi2pk': 'SCHED#sent',
      },
    }),
  );

  // 레거시 SNS push → 이벤트 발행 (notification-worker가 수신 알림 기록)
  await publishEvent('cheer.delivered', {
    cheerId: String(cheer.cheerId),
    senderId: String(cheer.senderId),
    receiverId: String(cheer.receiverId),
    challengeId: String(cheer.challengeId ?? ''),
    ...(cheer.day != null ? { day: Number(cheer.day) } : {}),
  });
}

/** 실패 처리 — 백오프 재시도 or 데드레터 이동 (레거시 handleCheerFailure 승계) */
async function handleCheerFailure(cheer: Record<string, any>, error: unknown): Promise<'retry' | 'dead'> {
  const now = new Date();
  const plan = planFailure({
    cheer,
    error,
    maxRetries: resolveMaxRetries(),
    backoffMinutes: parseBackoffMinutes(process.env.CHEER_SCHEDULED_BACKOFF_MINUTES),
    nowMs: now.getTime(),
  });

  if (plan.outcome === 'dead') {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(CHEER_TABLE),
        Key: { pk: `CHEER#${cheer.cheerId}`, sk: 'META' },
        UpdateExpression:
          'SET #status = :failed, retryCount = :retryCount, failureCode = :failureCode, deadLetterReason = :deadLetterReason, failedAt = :failedAt, gsi2pk = :gsi2pk',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':failed': 'failed',
          ':retryCount': plan.retryCount,
          ':failureCode': plan.failureCode,
          ':deadLetterReason': plan.deadLetterReason,
          ':failedAt': now.toISOString(),
          ':gsi2pk': 'SCHED#failed',
        },
      }),
    );

    await docClient.send(
      new PutCommand({
        TableName: tableName(CHEER_TABLE),
        Item: buildDeadLetterItem({ ...cheer, retryCount: plan.retryCount }, plan.failureCode, plan.deadLetterReason, now),
      }),
    );

    console.error(JSON.stringify({ level: 'error', message: 'Cheer moved to dead-letter', cheerId: cheer.cheerId, failureCode: plan.failureCode }));
    return 'dead';
  }

  // 재시도: scheduledTime(=gsi2sk)을 nextRetryAt으로 이동 — SCHED#pending 파티션에 유지
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(CHEER_TABLE),
      Key: { pk: `CHEER#${cheer.cheerId}`, sk: 'META' },
      UpdateExpression:
        'SET #status = :pending, retryCount = :retryCount, nextRetryAt = :nextRetryAt, scheduledTime = :nextRetryAt, gsi2sk = :nextRetryAt, failureCode = :failureCode, originalScheduledTime = if_not_exists(originalScheduledTime, :originalScheduledTime)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':pending': 'pending',
        ':retryCount': plan.retryCount,
        ':nextRetryAt': plan.nextRetryAt,
        ':failureCode': plan.failureCode,
        ':originalScheduledTime': plan.originalScheduledTime,
      },
    }),
  );
  return 'retry';
}

export const handler = async (event: EventBridgeEvent<string, unknown>) => {
  console.log(JSON.stringify({ level: 'info', message: 'Scheduled cheer sender triggered', eventId: event.id }));

  const now = new Date();
  const pendingCheers = await listDuePendingCheers(now.toISOString());
  const summary = emptySummary(pendingCheers.length);

  for (const cheer of pendingCheers) {
    try {
      const processNow = new Date();
      if (cheer.scheduledTime && new Date(cheer.scheduledTime) > processNow) {
        summary.skipped += 1;
        continue;
      }

      // 수신자가 이미 완료 → 알림 대신 발신자 감사 점수 적립 (cheer-latest.md §1)
      const receiverDone = cheer.day != null
        ? await isReceiverCompleted(String(cheer.receiverId), String(cheer.challengeId), Number(cheer.day))
        : false;

      if (receiverDone) {
        await grantThankScoreToSender(cheer, processNow);
        summary.senderScoreGranted += 1;
        console.log(JSON.stringify({ level: 'info', message: 'receiver already done, granted thank score to sender', cheerId: cheer.cheerId, senderId: cheer.senderId }));
      } else {
        await markSentAndPublish(cheer, processNow);
        summary.sent += 1;
      }
    } catch (error: any) {
      if (error?.name === 'ConditionalCheckFailedException') {
        summary.raceSkipped += 1;
        console.info(JSON.stringify({ level: 'info', message: 'skipped due to concurrent state change', cheerId: cheer.cheerId }));
        continue;
      }

      console.error(JSON.stringify({ level: 'error', message: 'Error sending cheer', cheerId: cheer.cheerId, error: error?.message ?? String(error) }));
      const failureOutcome = await handleCheerFailure(cheer, error);
      if (failureOutcome === 'retry') {
        summary.retried += 1;
      } else {
        summary.deadLettered += 1;
      }
    }
  }

  console.log(JSON.stringify({ level: 'info', message: 'Scheduled cheer sender summary', ...summary }));

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Scheduled cheers processed', ...summary }),
  };
};
