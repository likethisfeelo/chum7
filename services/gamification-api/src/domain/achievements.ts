/**
 * 퍼블릭 업적 응답 구성 — 순수 로직 (AWS 무의존).
 * 레거시: backend/services/personal-feed/achievements/index.ts 의 집계/매핑 블록
 * (응답 data 필드명·형태 그대로). cheers 는 cheer 도메인 소유 — 크로스 예외가 없어
 * 0 고정 (형태만 보존, PORTING.md §7).
 */

/** 레거시 리더 뱃지 분류 목록 그대로 */
export const LEADER_BADGE_IDS = new Set([
  'leader-debut',
  'leader-active',
  'leader-expert',
  'leader-streak',
]);

/** 레거시 personal-feed/challenges resolveBucketState 승계 (참여 완주/진행 판정) */
export function resolveParticipationBucket(
  status: unknown,
  phase: unknown,
): 'active' | 'completed' | 'gave_up' | 'preparing' {
  const st = String(status ?? '');
  const ph = String(phase ?? '');
  if (st === 'completed') return 'completed';
  if (st === 'failed' || st === 'gave_up') return 'gave_up';
  if (ph === 'preparing' || st === 'pending') return 'preparing';
  return 'active';
}

export interface AchievementsInput {
  participations: Array<{ status?: unknown; phase?: unknown }>;
  verifications: Array<{ score?: unknown }>;
  badges: Array<{ badgeId?: unknown; grantedAt?: unknown; challengeId?: unknown }>;
  createdChallenges: Array<{
    challengeId?: unknown;
    title?: unknown;
    lifecycle?: unknown;
    createdAt?: unknown;
    stats?: unknown;
  }>;
}

/** 레거시 achievements data 형태 그대로 구성 */
export function buildAchievementsView(input: AchievementsInput) {
  const buckets = input.participations.map((uc) => resolveParticipationBucket(uc.status, uc.phase));
  const completedChallenges = buckets.filter((b) => b === 'completed').length;
  const activeChallenges = buckets.filter((b) => b === 'active').length;

  const totalScore = input.verifications.reduce(
    (sum, v) => sum + (typeof v.score === 'number' ? v.score : 0),
    0,
  );

  const sortedBadges = [...input.badges].sort((a, b) =>
    String(b.grantedAt ?? '').localeCompare(String(a.grantedAt ?? '')),
  );
  const badges = sortedBadges
    .filter((b) => !LEADER_BADGE_IDS.has(String(b.badgeId)))
    .map((b) => ({
      badgeId: String(b.badgeId),
      grantedAt: (b.grantedAt as string) ?? '',
      challengeId: (b.challengeId as string) ?? null,
    }));
  const leaderBadges = sortedBadges
    .filter((b) => LEADER_BADGE_IDS.has(String(b.badgeId)))
    .map((b) => ({
      badgeId: String(b.badgeId),
      grantedAt: (b.grantedAt as string) ?? '',
    }));

  const completedLeaderChallenges = input.createdChallenges.filter(
    (ch) => ch.lifecycle === 'completed',
  );
  const activeLeaderChallenges = input.createdChallenges.filter(
    (ch) => ch.lifecycle === 'active' || ch.lifecycle === 'preparing' || ch.lifecycle === 'recruiting',
  );
  const totalLeaderParticipants = input.createdChallenges.reduce((sum, ch) => {
    const stats = ch.stats as { currentParticipants?: number; totalParticipants?: number } | undefined;
    return sum + (stats?.currentParticipants ?? stats?.totalParticipants ?? 0);
  }, 0);

  return {
    challenges: {
      total: input.participations.length,
      completed: completedChallenges,
      active: activeChallenges,
    },
    verifications: {
      total: input.verifications.length,
      totalScore,
    },
    // cheer 도메인 크로스 예외 없음 — 형태만 보존 (0 고정, PORTING.md §7)
    cheers: { sentCount: 0, receivedCount: 0 },
    badges,
    leaderBadges,
    leaderHistory: {
      total: input.createdChallenges.length,
      completed: completedLeaderChallenges.length,
      active: activeLeaderChallenges.length,
      totalParticipants: totalLeaderParticipants,
      recentChallenges: completedLeaderChallenges.slice(0, 5).map((ch) => ({
        challengeId: ch.challengeId,
        title: ch.title,
        lifecycle: ch.lifecycle,
        createdAt: ch.createdAt,
        participantCount:
          (ch.stats as { currentParticipants?: number; totalParticipants?: number } | undefined)
            ?.currentParticipants ??
          (ch.stats as { totalParticipants?: number } | undefined)?.totalParticipants ??
          0,
      })),
    },
  };
}
