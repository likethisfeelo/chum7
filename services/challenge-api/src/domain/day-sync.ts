/**
 * 날짜·타임존·챌린지 day 동기화 순수 로직.
 * 레거시 backend/shared/lib/challenge-quest-policy.ts + challenge-day-sync.ts 이식
 * (동작 변경 금지 — import 경로만 수정).
 */

export const DEFAULT_TIMEZONE = 'Asia/Seoul';

export type PracticeTimeValidationResult =
  | { ok: true; certDate: string }
  | { ok: false; errorCode: 'FUTURE_PRACTICE_TIME' | 'PRACTICE_TOO_OLD' };

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

export function validatePracticeAt(
  practiceAt: string,
  uploadAtIso: string,
  timezone?: string,
): PracticeTimeValidationResult {
  const practiceMs = new Date(practiceAt).getTime();
  const uploadMs = new Date(uploadAtIso).getTime();

  if (Number.isNaN(practiceMs)) {
    return { ok: false, errorCode: 'PRACTICE_TOO_OLD' };
  }

  if (practiceMs > uploadMs) {
    return { ok: false, errorCode: 'FUTURE_PRACTICE_TIME' };
  }

  const practiceCertDate = certDateFromIso(practiceAt, timezone);
  const uploadCertDate = certDateFromIso(uploadAtIso, timezone);

  if (practiceCertDate < uploadCertDate) {
    return { ok: false, errorCode: 'PRACTICE_TOO_OLD' };
  }

  return { ok: true, certDate: practiceCertDate };
}

export function calculateChallengeDay(startDateIso: string, certDate: string, timezone?: string): number {
  const tz = safeTimezone(timezone);
  const startCertDate = certDateFromIso(startDateIso, tz);

  const startUtc = new Date(`${startCertDate}T00:00:00.000Z`).getTime();
  const certUtc = new Date(`${certDate}T00:00:00.000Z`).getTime();

  return Math.floor((certUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1;
}

export function isInvalidDayDelta(requestDay: number, calculatedDay: number): boolean {
  return requestDay !== calculatedDay;
}

export function remedyScore(basePoints: number): number {
  return Math.floor(basePoints * 0.7);
}

// ── challenge-day-sync (레거시 이식) ────────────────────────────────────────

function normalizeDurationDays(value: unknown, fallback = 7): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return Math.max(1, Math.floor(Number(fallback) || 7));
}

function normalizeStoredCurrentDay(value: unknown, durationDays: number): number {
  const parsed = Number(value);
  const maxDay = Math.max(1, durationDays) + 1;
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(maxDay, Math.floor(parsed)));
}

export function clampDay(day: number, durationDays: number): number {
  const normalizedDurationDays = normalizeDurationDays(durationDays);
  const maxDay = normalizedDurationDays + 1;
  const normalizedDay = Number.isFinite(day) ? Math.floor(day) : 1;
  return Math.max(1, Math.min(maxDay, normalizedDay));
}

export function calculateSyncedCurrentDay(
  startDateIso: string,
  nowIso: string,
  timezone: string | undefined,
  durationDays: number,
): number {
  const tz = safeTimezone(timezone);
  const certDate = certDateFromIso(nowIso, tz);

  try {
    const calculatedDay = calculateChallengeDay(startDateIso, certDate, tz);
    if (!Number.isFinite(calculatedDay)) {
      return 1;
    }
    return clampDay(calculatedDay, durationDays);
  } catch {
    return 1;
  }
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

export function calculateEffectiveCurrentDay(
  userChallenge: {
    currentDay?: unknown;
    phase?: unknown;
    status?: unknown;
    startDate?: unknown;
    challengeStartAt?: unknown;
    timezone?: string;
  },
  nowIso: string,
  durationDays: number,
): number {
  const normalizedDurationDays = normalizeDurationDays(durationDays);
  const storedCurrentDay = normalizeStoredCurrentDay(userChallenge.currentDay, normalizedDurationDays);
  const phase = String(userChallenge.phase || '').toLowerCase();
  const status = String(userChallenge.status || '').toLowerCase();
  const candidateStartDate =
    typeof userChallenge.startDate === 'string' && userChallenge.startDate.length > 0
      ? userChallenge.startDate
      : typeof userChallenge.challengeStartAt === 'string' && userChallenge.challengeStartAt.length > 0
        ? userChallenge.challengeStartAt
        : null;

  const canSync =
    (phase === 'active' || phase === 'in_progress') &&
    (status === 'active' || status === 'in_progress') &&
    candidateStartDate !== null;

  if (!canSync) return storedCurrentDay;

  const startDate = candidateStartDate as string;

  const syncedCurrentDay = calculateSyncedCurrentDay(
    startDate,
    nowIso,
    userChallenge.timezone,
    normalizedDurationDays,
  );

  if (!Number.isFinite(syncedCurrentDay)) return storedCurrentDay;

  return Math.max(storedCurrentDay, syncedCurrentDay);
}

/**
 * 보완 창이 닫혔는지 — 챌린지 기간이 지나면 보완할 수 없다.
 * 종료 시점에 점수·완주 판정이 확정되므로, 이후 보완으로 결과가 바뀌면 안 된다
 * (인증 취소로 특별 개방된 일자도 동일하게 닫힌다).
 */
export function isRemedyWindowClosed(effectiveCurrentDay: number, durationDays: number): boolean {
  return effectiveCurrentDay > normalizeDurationDays(durationDays);
}

export function isChallengePeriodEnded(
  effectiveCurrentDay: number,
  durationDays: number,
  status: unknown,
): boolean {
  return effectiveCurrentDay > durationDays || status === 'completed' || status === 'failed';
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
