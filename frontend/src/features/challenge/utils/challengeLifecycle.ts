export type ChallengeBucket = 'active' | 'preparing' | 'completed' | 'other';

export function resolveChallengeDay(item: any): number {
  const durationDays = Number(item?.durationDays || item?.challenge?.durationDays || 7);
  const safeDurationDays = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : 7;
  const rawCurrentDay = Number(item?.currentDay || 1);
  const maxDay = safeDurationDays + 1;
  if (!Number.isFinite(rawCurrentDay)) return 1;
  return Math.max(1, Math.min(maxDay, Math.floor(rawCurrentDay)));
}

export function resolveProgressDay(item: any, fallbackIndex?: number): number | null {
  const parsedDay = Number(item?.day);
  if (Number.isFinite(parsedDay)) return Math.max(1, Math.floor(parsedDay));
  if (typeof fallbackIndex === 'number' && Number.isFinite(fallbackIndex)) return Math.max(1, Math.floor(fallbackIndex) + 1);
  return null;
}

export function isCompletedVerificationStatus(status: any): boolean {
  const key = String(status || '').toLowerCase();
  return key === 'success' || key === 'remedy' || key === 'failed';
}

export function isVerificationDayCompleted(progress: any, day: number): boolean {
  const target = getProgressEntryByDay(progress, day);
  return isCompletedVerificationStatus(target?.status);
}

export function countParticipatedDays(progress: any): number {
  const list = Array.isArray(progress) ? progress : [];
  const completedDaySet = new Set<number>();

  list.forEach((item: any, index: number) => {
    const day = resolveProgressDay(item, index);
    if (!day) return;
    if (isCompletedVerificationStatus(item?.status)) {
      completedDaySet.add(day);
    }
  });

  return completedDaySet.size;
}

export function getProgressEntryByDay(progress: any, day: number): any | undefined {
  const list = Array.isArray(progress) ? progress : [];
  const targetDay = Number(day);
  let target: any | undefined;

  list.forEach((item: any, index: number) => {
    const itemDay = resolveProgressDay(item, index);
    if (itemDay === targetDay) {
      target = item;
    }
  });

  return target;
}

export function getLatestCompletedProgressEntry(progress: any): { entry: any; day: number } | null {
  const list = Array.isArray(progress) ? progress : [];
  let latest: { entry: any; day: number } | null = null;

  list.forEach((item: any, index: number) => {
    const day = resolveProgressDay(item, index);
    if (!day) return;
    if (!isCompletedVerificationStatus(item?.status)) return;
    if (!latest || day >= latest.day) {
      latest = { entry: item, day };
    }
  });

  return latest;
}

export function resolveVerificationStatusForDay(progress: any, day: number, currentDay: number): string {
  const entry = getProgressEntryByDay(progress, day);
  if (entry?.status) return String(entry.status).toLowerCase();
  return day < Number(currentDay) ? 'skipped' : 'pending';
}

export function resolveChallengeBucket(item: any): ChallengeBucket {
  const userStatus = String(item?.status || '').toLowerCase();
  const userPhase = String(item?.phase || '').toLowerCase();
  const lifecycle = String(item?.challenge?.lifecycle || '').toLowerCase();

  if (userStatus === 'failed' || userPhase === 'failed' || lifecycle === 'archived') {
    return 'completed';
  }

  if (userPhase === 'in_progress' || userPhase === 'active') {
    return 'active';
  }

  if (userStatus === 'completed' || userPhase === 'completed' || lifecycle === 'completed') {
    return 'completed';
  }

  if (userStatus === 'active' || userStatus === 'in_progress') {
    if (userPhase === 'preparing' || lifecycle === 'recruiting' || lifecycle === 'preparing') {
      return 'preparing';
    }
    return 'active';
  }

  return 'other';
}

export function getChallengeStatusLabel(item: any): string {
  const bucket = resolveChallengeBucket(item);
  if (bucket === 'preparing') return '준비중';
  if (bucket === 'completed') return '완주';
  return '진행중';
}
