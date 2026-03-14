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
  return Math.max(1, Math.min(maxDay, day));
}

export function calculateSyncedCurrentDay(
  startDateIso: string,
  nowIso: string,
  timezone: string | undefined,
  durationDays: number,
): number {
  const tz = safeTimezone(timezone);
  const certDate = certDateFromIso(nowIso, tz);
  const calculatedDay = calculateChallengeDay(startDateIso, certDate, tz);
  return clampDay(calculatedDay, durationDays);
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
    timezone?: string;
  },
  nowIso: string,
  durationDays: number,
): number {
  const normalizedDurationDays = normalizeDurationDays(durationDays);
  const storedCurrentDay = normalizeStoredCurrentDay(userChallenge.currentDay, normalizedDurationDays);
  const canSync =
    userChallenge.phase === 'active' &&
    userChallenge.status === 'active' &&
    typeof userChallenge.startDate === 'string' &&
    userChallenge.startDate.length > 0;

  if (!canSync) return storedCurrentDay;

  const startDate = userChallenge.startDate as string;

  return Math.max(
    storedCurrentDay,
    calculateSyncedCurrentDay(
      startDate,
      nowIso,
      userChallenge.timezone,
      normalizedDurationDays,
    ),
  );
}
