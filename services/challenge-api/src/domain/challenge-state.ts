/** 레거시 backend/shared/lib/challenge-state.ts 이식 (동작 변경 금지). */
import { isChallengePeriodEnded } from './day-sync';

export function resolveNormalizedChallengeState(input: {
  status: unknown;
  phase: unknown;
  challengeLifecycle: unknown;
  effectiveCurrentDay: number;
  durationDays: number;
  completedDays: number;
}): { status: string; phase: string } {
  const status = typeof input.status === 'string' ? input.status : 'active';
  const phase = typeof input.phase === 'string' ? input.phase : status;
  const lifecycle = typeof input.challengeLifecycle === 'string' ? input.challengeLifecycle : undefined;

  // 중도 포기한 경우 그대로 유지
  if (status === 'gave_up' || phase === 'gave_up') {
    return { status: 'gave_up', phase: 'gave_up' };
  }

  const shouldAutoFinalize =
    status !== 'completed' &&
    status !== 'failed' &&
    (lifecycle === 'completed' ||
      lifecycle === 'archived' ||
      isChallengePeriodEnded(input.effectiveCurrentDay, input.durationDays, status));

  if (!shouldAutoFinalize) {
    // If challenge is active but user phase is still 'preparing', promote phase to match
    if (lifecycle === 'active' && phase === 'preparing' && status !== 'completed' && status !== 'failed') {
      return { status, phase: 'active' };
    }
    return { status, phase };
  }

  const finalizedStatus = input.completedDays >= input.durationDays ? 'completed' : 'failed';
  return { status: finalizedStatus, phase: finalizedStatus };
}

export function matchesRequestedChallengeStatus(requestedStatus: string, normalizedStatus: string): boolean {
  const requested = String(requestedStatus || 'active').toLowerCase();
  const normalized = String(normalizedStatus || '').toLowerCase();

  if (requested === 'all') return true;
  if (requested === 'active') return normalized === 'active'; // gave_up 제외
  if (requested === 'gave_up') return normalized === 'gave_up';
  if (requested === 'completed') return normalized === 'completed';
  if (requested === 'failed') return normalized === 'failed';
  return normalized === requested;
}

// ── 읽기 시점 유효 라이프사이클 (시간 문제 개선 — docs/time-policy.md R4) ──
import { resolveEffectiveLifecycle, type ChallengeLifecycle } from '@chum7/core';
import { certDateFromIso, DEFAULT_TIMEZONE, resolveDurationDays } from './day-sync';

/** 스케줄 필드 별칭 해석 (레거시 recruitStartAt/recruitingEndAt 승계) */
export function recruitOpenAtOf(ch: Record<string, unknown>): string | null {
  return (
    (ch.recruitOpenAt as string) ||
    (ch.recruitStartAt as string) ||
    (ch.recruitingStartAt as string) ||
    null
  );
}
export function recruitCloseAtOf(ch: Record<string, unknown>): string | null {
  return (
    (ch.recruitCloseAt as string) || (ch.recruitEndAt as string) || (ch.recruitingEndAt as string) || null
  );
}

/**
 * "지금 이 순간의" 라이프사이클 — 워커(10분 주기) 실행 사이의 지연을 표시에서 흡수한다.
 * 저장 상태(lifecycle)는 그대로 두고 응답에 effectiveLifecycle로 병기한다.
 */
export function effectiveLifecycleOf(ch: Record<string, unknown>, now: Date): ChallengeLifecycle {
  const nowIso = now.toISOString();
  const startAtIso = (ch.actualStartAt as string) || (ch.challengeStartAt as string) || undefined;
  return resolveEffectiveLifecycle({
    lifecycle: ch.lifecycle as ChallengeLifecycle,
    recruitOpenAt: recruitOpenAtOf(ch),
    recruitCloseAt: recruitCloseAtOf(ch),
    startDate: startAtIso ? certDateFromIso(startAtIso, DEFAULT_TIMEZONE) : undefined,
    durationDays: resolveDurationDays(ch.durationDays, undefined),
    nowIso,
    today: certDateFromIso(nowIso, DEFAULT_TIMEZONE),
    requireStartConfirmation: ch.requireStartConfirmation === true,
    startConfirmed: Boolean(ch.startConfirmedAt),
  });
}
