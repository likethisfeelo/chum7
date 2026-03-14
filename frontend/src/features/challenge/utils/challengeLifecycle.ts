export type ChallengeBucket = 'active' | 'preparing' | 'completed' | 'other';

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
