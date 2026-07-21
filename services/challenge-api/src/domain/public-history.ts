/**
 * 퍼블릭 프로필 챌린지 이력 뷰 — 순수 로직 (AWS 무의존).
 * 레거시: backend/services/personal-feed/challenges/index.ts 의
 * resolveBucketState/countCompletedDays/아이템 매핑 (동작 변경 금지).
 */

export type BucketState = 'active' | 'completed' | 'gave_up' | 'preparing';

/** 레거시 resolveBucketState 그대로 (신규 UC 아이템에는 bucketState 속성이 없어 status/phase 로 판정) */
export function resolveBucketState(status: string, phase: string): BucketState {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'gave_up') return 'gave_up';
  if (phase === 'preparing' || status === 'pending') return 'preparing';
  return 'active';
}

/** 레거시 countCompletedDays 그대로 (success/partial/completed/remedy 를 완료로 집계) */
export function countCompletedDays(progress: unknown): number {
  if (!Array.isArray(progress)) return 0;
  const completedStatuses = new Set(['success', 'partial', 'completed', 'remedy']);
  return progress.filter((p) => completedStatuses.has((p as { status?: string })?.status ?? '')).length;
}

export interface ChallengeHistoryItem {
  userChallengeId: string;
  challengeId: string;
  title: string;
  category: string | null;
  badgeIcon: string | null;
  badgeName: string | null;
  durationDays: number;
  completedDays: number;
  score: number;
  bucketState: BucketState;
  startDate: string | null;
  challengeStartAt: string | null;
  actualStartAt: string | null;
}

/** 레거시 personal-feed/challenges 아이템 결합 (필드명·기본값 그대로) */
export function buildChallengeHistoryItem(
  uc: Record<string, unknown>,
  challenge: Record<string, unknown> | undefined,
): ChallengeHistoryItem {
  const progress = (uc.progress as unknown[]) ?? [];
  const durationDays = (challenge?.durationDays as number) ?? (progress.length || 7);
  return {
    userChallengeId: uc.userChallengeId as string,
    challengeId: uc.challengeId as string,
    title: (challenge?.title as string) ?? '알 수 없는 챌린지',
    category: (challenge?.category as string) ?? null,
    badgeIcon: (challenge?.badgeIcon as string) ?? null,
    badgeName: (challenge?.badgeName as string) ?? null,
    durationDays,
    completedDays: countCompletedDays(progress),
    score: typeof uc.score === 'number' ? uc.score : 0,
    bucketState: resolveBucketState(String(uc.status ?? ''), String(uc.phase ?? '')),
    startDate: (uc.startDate as string) ?? null,
    challengeStartAt: (challenge?.challengeStartAt as string) ?? null,
    actualStartAt: (challenge?.actualStartAt as string) ?? null,
  };
}
