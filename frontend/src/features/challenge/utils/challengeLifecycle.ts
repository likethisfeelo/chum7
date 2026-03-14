export type ChallengeBucket = 'active' | 'preparing' | 'completed' | 'other';

export function resolveChallengeDay(item: any): number {
  const durationDays = Number(item?.durationDays || item?.challenge?.durationDays || 7);
  const safeDurationDays = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : 7;
  const rawCurrentDay = Number(item?.currentDay || 1);
  const maxDay = safeDurationDays + 1;
  if (!Number.isFinite(rawCurrentDay)) return 1;
  return Math.max(1, Math.min(maxDay, Math.floor(rawCurrentDay)));
}

export function isVerificationDayCompleted(progress: any, day: number): boolean {
  const list = Array.isArray(progress) ? progress : [];
  const target = list.find((item: any) => Number(item?.day) === Number(day));
  const status = String(target?.status || '').toLowerCase();
  return status === 'success' || status === 'remedy' || status === 'failed';
}

export function countParticipatedDays(progress: any): number {
  const list = Array.isArray(progress) ? progress : [];
  const completedDaySet = new Set<number>();

  list.forEach((item: any) => {
    const day = Number(item?.day);
    if (!Number.isFinite(day)) return;
    const status = String(item?.status || '').toLowerCase();
    if (status === 'success' || status === 'remedy' || status === 'failed') {
      completedDaySet.add(Math.floor(day));
    }
  });

  return completedDaySet.size;
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
