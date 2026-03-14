export type ChallengeBucket = 'pending' | 'active' | 'completed' | 'other';

export function isVerificationDayCompleted(status?: string): boolean {
  return status === 'success' || status === 'remedy' || status === 'failed';
}

export function getDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseChallengeStartDateFromUserChallenge(challenge: any): Date | null {
  const start = challenge?.startDate || challenge?.challenge?.startDate || challenge?.challenge?.challengeStartAt;
  if (!start || typeof start !== 'string') return null;

  const dateOnlyMatch = start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) return null;
  return getDateOnly(parsed);
}

export function resolveChallengeDurationDays(challenge: any): number {
  const raw = Number(challenge?.challenge?.durationDays);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  const progressLength = Array.isArray(challenge?.progress) ? challenge.progress.length : 0;
  if (progressLength > 0) return progressLength;
  return 7;
}

export function resolveChallengeDay(challenge: any): number {
  const durationDays = resolveChallengeDurationDays(challenge);
  const maxDay = durationDays + 1;
  const storedCurrentDay = Math.max(1, Math.min(maxDay, Number(challenge?.currentDay || 1)));

  const lifecycle = String(challenge?.challenge?.lifecycle || '').toLowerCase();
  const phase = String(challenge?.phase || '').toLowerCase();
  const status = String(challenge?.status || '').toLowerCase();

  const canSyncElapsedDay =
    (lifecycle === 'active' || phase === 'active') &&
    (status === '' || status === 'active');

  if (!canSyncElapsedDay) return storedCurrentDay;

  const startDate = parseChallengeStartDateFromUserChallenge(challenge);
  if (!startDate) return storedCurrentDay;

  const today = getDateOnly(new Date());
  const diffMs = today.getTime() - startDate.getTime();
  const elapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  const syncedCurrentDay = Math.max(1, Math.min(maxDay, elapsed));

  return Math.max(storedCurrentDay, syncedCurrentDay);
}

export function countParticipatedDays(challenge: any): number {
  const progress = Array.isArray(challenge?.progress) ? challenge.progress : [];
  return progress.filter((item: any) => isVerificationDayCompleted(item?.status)).length;
}

export function resolveChallengeBucket(challenge: any): ChallengeBucket {
  const lifecycle = String(challenge?.challenge?.lifecycle || '').toLowerCase();
  const phase = String(challenge?.phase || '').toLowerCase();
  const status = String(challenge?.status || '').toLowerCase();

  if (status === 'completed' || status === 'failed' || phase === 'completed' || lifecycle === 'completed' || lifecycle === 'archived') {
    return 'completed';
  }

  if (phase === 'preparing' || lifecycle === 'recruiting' || lifecycle === 'preparing') {
    return 'pending';
  }

  if (phase === 'active' || phase === 'in_progress' || status === 'active' || status === 'in_progress' || lifecycle === 'active') {
    return 'active';
  }

  return 'other';
}
