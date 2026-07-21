import { buildAchievementsView, resolveParticipationBucket } from './achievements';

describe('업적 집계 (레거시 personal-feed/achievements 계약)', () => {
  it('참여 버킷 판정 — 레거시 resolveBucketState 승계', () => {
    expect(resolveParticipationBucket('completed', 'active')).toBe('completed');
    expect(resolveParticipationBucket('failed', 'active')).toBe('gave_up');
    expect(resolveParticipationBucket('gave_up', undefined)).toBe('gave_up');
    expect(resolveParticipationBucket('active', 'preparing')).toBe('preparing');
    expect(resolveParticipationBucket('pending', 'x')).toBe('preparing');
    expect(resolveParticipationBucket('active', 'active')).toBe('active');
  });

  const view = buildAchievementsView({
    participations: [
      { status: 'completed', phase: 'completed' },
      { status: 'active', phase: 'active' },
      { status: 'failed', phase: 'active' },
    ],
    verifications: [{ score: 1 }, { score: 0 }, { score: 'bad' }],
    badges: [
      { badgeId: 'first-step', grantedAt: '2026-01-02T00:00:00Z', challengeId: 'c1' },
      { badgeId: 'leader-debut', grantedAt: '2026-01-03T00:00:00Z' },
      { badgeId: 'streak-7', grantedAt: '2026-01-05T00:00:00Z' },
    ],
    createdChallenges: [
      {
        challengeId: 'c1',
        title: '완주 챌린지',
        lifecycle: 'completed',
        createdAt: '2026-01-01T00:00:00Z',
        stats: { currentParticipants: 4 },
      },
      { challengeId: 'c2', title: '모집중', lifecycle: 'recruiting', stats: { totalParticipants: 2 } },
      { challengeId: 'c3', title: '드래프트', lifecycle: 'draft' },
    ],
  });

  it('완주/진행 챌린지 수 집계', () => {
    expect(view.challenges).toEqual({ total: 3, completed: 1, active: 1 });
  });

  it('인증 수·총점 집계 (숫자 아닌 score 는 0 취급)', () => {
    expect(view.verifications).toEqual({ total: 3, totalScore: 1 });
  });

  it('뱃지는 일반/리더로 분류하고 최신순 정렬', () => {
    expect(view.badges.map((b) => b.badgeId)).toEqual(['streak-7', 'first-step']);
    expect(view.badges[0]!.challengeId).toBeNull();
    expect(view.leaderBadges).toEqual([{ badgeId: 'leader-debut', grantedAt: '2026-01-03T00:00:00Z' }]);
  });

  it('리더 이력 — 완주/진행 분류 + 참여자 합산 + recentChallenges 5건 제한', () => {
    expect(view.leaderHistory.total).toBe(3);
    expect(view.leaderHistory.completed).toBe(1);
    expect(view.leaderHistory.active).toBe(1); // recruiting 포함, draft 제외
    expect(view.leaderHistory.totalParticipants).toBe(6);
    expect(view.leaderHistory.recentChallenges).toEqual([
      {
        challengeId: 'c1',
        title: '완주 챌린지',
        lifecycle: 'completed',
        createdAt: '2026-01-01T00:00:00Z',
        participantCount: 4,
      },
    ]);
  });

  it('cheers 는 형태만 보존 (0 고정 — cheer 도메인 크로스 예외 없음)', () => {
    expect(view.cheers).toEqual({ sentCount: 0, receivedCount: 0 });
  });
});
