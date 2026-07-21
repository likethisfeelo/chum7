/**
 * 예약 응원 취소 판정 순수 로직 — 레거시 cancel-scheduled 동작 이식
 * (test/backend/cancel-scheduled.test.ts가 규정한 계약: 발송 임박(cutoff) 시 CANCELLATION_WINDOW_CLOSED).
 */

const DEFAULT_CANCELLATION_CUTOFF_MINUTES = 5;

/** env CHEER_SCHEDULED_CANCELLATION_CUTOFF_MINUTES 해석 (기본 5분) */
export function resolveCancellationCutoffMinutes(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CANCELLATION_CUTOFF_MINUTES;
  return Math.floor(parsed);
}

export type CancellationDecision =
  | { ok: true }
  | { ok: false; status: number; error: string; message: string };

export function evaluateCancellation(params: {
  cheer: Record<string, any> | undefined;
  userId: string;
  nowMs: number;
  cutoffMinutes: number;
}): CancellationDecision {
  const { cheer, userId, nowMs, cutoffMinutes } = params;

  if (!cheer) {
    return { ok: false, status: 404, error: 'CHEER_NOT_FOUND', message: '응원을 찾을 수 없습니다' };
  }
  if (cheer.senderId !== userId) {
    return { ok: false, status: 403, error: 'FORBIDDEN', message: '본인이 보낸 응원만 취소할 수 있습니다' };
  }
  if (cheer.cheerType !== 'scheduled') {
    return { ok: false, status: 400, error: 'NOT_SCHEDULED_CHEER', message: '예약 응원만 취소할 수 있습니다' };
  }
  if (cheer.status !== 'pending') {
    return { ok: false, status: 409, error: 'ALREADY_PROCESSED', message: '이미 처리된 응원입니다' };
  }

  const scheduledMs = cheer.scheduledTime ? new Date(cheer.scheduledTime).getTime() : Number.NaN;
  if (!Number.isFinite(scheduledMs) || scheduledMs - nowMs <= cutoffMinutes * 60_000) {
    return {
      ok: false,
      status: 400,
      error: 'CANCELLATION_WINDOW_CLOSED',
      message: '발송이 임박한 예약 응원은 취소할 수 없습니다',
    };
  }

  return { ok: true };
}
