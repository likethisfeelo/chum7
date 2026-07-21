/**
 * 사본: services/challenge-api/src/domain/day-sync.ts 중 lifecycle-manager가 쓰는 함수만 발췌
 * (서비스 간 import 금지 원칙 — 동작 변경 금지. 원본: backend/shared/lib/challenge-day-sync.ts).
 */

export const DEFAULT_TIMEZONE = 'Asia/Seoul';

export function safeTimezone(timezone?: string): string {
  if (!timezone) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function certDateFromIso(iso: string, timezone?: string): string {
  const tz = safeTimezone(timezone);
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function normalizeDurationDays(value: unknown, fallback = 7): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return Math.max(1, Math.floor(Number(fallback) || 7));
}

export function resolveDurationDays(
  challengeDurationDays: unknown,
  userChallengeProgress: unknown,
  fallback = 7,
): number {
  const challengeCandidate = Number(challengeDurationDays);
  if (Number.isFinite(challengeCandidate) && challengeCandidate > 0) {
    return Math.floor(challengeCandidate);
  }

  const fromProgress = Array.isArray(userChallengeProgress)
    ? userChallengeProgress.length
    : userChallengeProgress && typeof userChallengeProgress === 'object'
      ? Object.keys(userChallengeProgress as Record<string, unknown>).length
      : 0;

  if (Number.isFinite(fromProgress) && fromProgress > 0) {
    return fromProgress;
  }

  return normalizeDurationDays(undefined, fallback);
}

export function calculateChallengeEndAt(startAtIso: string, durationDays: number): string {
  const startDate = new Date(startAtIso);
  if (Number.isNaN(startDate.getTime())) {
    return startAtIso;
  }
  const normalizedDurationDays = normalizeDurationDays(durationDays);
  startDate.setDate(startDate.getDate() + normalizedDurationDays);
  return startDate.toISOString();
}

export function resolveChallengeActualStartAt(challenge: {
  actualStartAt?: unknown;
  startConfirmedAt?: unknown;
  challengeStartAt?: unknown;
}): string | null {
  const actualStartAt = typeof challenge.actualStartAt === 'string' ? challenge.actualStartAt : '';
  if (actualStartAt) return actualStartAt;

  const startConfirmedAt = typeof challenge.startConfirmedAt === 'string' ? challenge.startConfirmedAt : '';
  if (startConfirmedAt) return startConfirmedAt;

  const challengeStartAt = typeof challenge.challengeStartAt === 'string' ? challenge.challengeStartAt : '';
  if (challengeStartAt) return challengeStartAt;

  return null;
}

export function isCompletedProgressStatus(status: unknown): boolean {
  const key = String(status || '').toLowerCase();
  return key === 'completed' || key === 'success' || key === 'remedy';
}
