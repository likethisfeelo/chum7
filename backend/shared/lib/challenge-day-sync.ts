import { calculateChallengeDay, certDateFromIso, safeTimezone } from './challenge-quest-policy';



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
