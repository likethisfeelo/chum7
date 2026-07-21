/**
 * 예약 응원 발송 판정 순수 로직 — 레거시 backend/services/cheer/send-scheduled 이식
 * + docs/cheer-latest.md (점수/알림 분리: send-scheduled가 receiver_completed vs sent 판정).
 * AWS 무의존 — 핸들러(src/index.ts)가 이 판정 결과로 테이블을 갱신한다.
 */

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_BACKOFF_MINUTES = [1, 5, 15];
/** 데드레터 보관 30일 (레거시 승계) */
export const DEAD_LETTER_TTL_SECONDS = 60 * 60 * 24 * 30;

/** 레거시 normalizeProgress 이식 (배열/객체 맵 모두 허용) */
export function normalizeProgress(progress: unknown): Array<Record<string, any>> {
  if (!progress) return [];
  if (Array.isArray(progress)) return progress;
  if (typeof progress === 'object') return Object.values(progress as Record<string, any>);
  return [];
}

/** 수신자가 해당 day를 완료했는지 — progress[day].status === 'success' (cheer-latest.md §3-1) */
export function isReceiverDayCompleted(
  participation: Record<string, any> | undefined,
  day: number,
): boolean {
  if (!participation) return false;
  const progress = normalizeProgress(participation.progress);
  const dayEntry = progress.find((p) => Number(p?.day) === day);
  return dayEntry?.status === 'success';
}

/** 실패 코드 분류 (레거시 toFailureCode 이식) */
export function toFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/throttl|rate.?exceed|too many/i.test(message)) return 'THROTTLED';
  if (/timeout|timed out|socket/i.test(message)) return 'TIMEOUT';
  if (/authoriz|forbidden|access denied/i.test(message)) return 'PERMISSION_DENIED';
  return 'NOTIFICATION_SEND_FAILED';
}

/** env CHEER_SCHEDULED_BACKOFF_MINUTES 해석 (기본 1,5,15) */
export function parseBackoffMinutes(raw: string | undefined): number[] {
  const parsed = (raw ?? DEFAULT_BACKOFF_MINUTES.join(','))
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  return parsed;
}

export function getBackoffMinutes(backoffMinutes: number[], retryCountAfterIncrement: number): number {
  if (backoffMinutes.length === 0) return 1;
  const index = Math.min(retryCountAfterIncrement - 1, backoffMinutes.length - 1);
  return backoffMinutes[index] ?? 1;
}

export type FailurePlan =
  | { outcome: 'retry'; retryCount: number; failureCode: string; nextRetryAt: string; originalScheduledTime: string | null }
  | { outcome: 'dead'; retryCount: number; failureCode: string; deadLetterReason: string };

/** 실패 처리 계획 — 재시도 여부/다음 시각/데드레터 사유 (레거시 handleCheerFailure 판정부) */
export function planFailure(params: {
  cheer: Record<string, any>;
  error: unknown;
  maxRetries: number;
  backoffMinutes: number[];
  nowMs: number;
}): FailurePlan {
  const { cheer, error, maxRetries, backoffMinutes, nowMs } = params;
  const currentRetry = Number(cheer.retryCount ?? 0);
  const nextRetryCount = currentRetry + 1;
  const failureCode = toFailureCode(error);

  if (nextRetryCount > maxRetries) {
    return {
      outcome: 'dead',
      retryCount: currentRetry,
      failureCode,
      deadLetterReason: error instanceof Error ? error.message : String(error),
    };
  }

  const backoff = getBackoffMinutes(backoffMinutes, nextRetryCount);
  return {
    outcome: 'retry',
    retryCount: nextRetryCount,
    failureCode,
    nextRetryAt: new Date(nowMs + backoff * 60_000).toISOString(),
    originalScheduledTime: (cheer.originalScheduledTime ?? cheer.scheduledTime ?? null) as string | null,
  };
}

/**
 * 데드레터 아이템 (레거시 moveToDeadLetter 필드 승계 + cheer 테이블 키 설계:
 * pk=`DLQ#<cheerId>`/sk=`META`(ttl), gsi2pk=`DLQ#<YYYY-MM-DD>`, gsi2sk=`<failedAt>`)
 */
export function buildDeadLetterItem(
  cheer: Record<string, any>,
  failureCode: string,
  deadLetterReason: string,
  now: Date,
): Record<string, any> {
  const nowIso = now.toISOString();
  const failedDate = nowIso.slice(0, 10);
  return {
    pk: `DLQ#${cheer.cheerId}`,
    sk: 'META',
    gsi2pk: `DLQ#${failedDate}`,
    gsi2sk: nowIso,
    cheerId: cheer.cheerId,
    status: 'dead',
    failedAt: nowIso,
    retryCount: cheer.retryCount ?? 0,
    failureCode,
    deadLetterReason,
    originalScheduledTime: cheer.originalScheduledTime ?? cheer.scheduledTime ?? null,
    lastScheduledTime: cheer.scheduledTime ?? null,
    senderId: cheer.senderId,
    receiverId: cheer.receiverId,
    challengeId: cheer.challengeId ?? null,
    message: cheer.message ?? null,
    ttl: Math.floor(now.getTime() / 1000) + DEAD_LETTER_TTL_SECONDS,
  };
}

export interface SendSummary {
  scanned: number;
  sent: number;
  retried: number;
  deadLettered: number;
  skipped: number;
  raceSkipped: number;
  senderScoreGranted: number;
}

export function emptySummary(scanned: number): SendSummary {
  return { scanned, sent: 0, retried: 0, deadLettered: 0, skipped: 0, raceSkipped: 0, senderScoreGranted: 0 };
}
