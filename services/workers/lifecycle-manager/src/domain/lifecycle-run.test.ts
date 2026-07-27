import {
  buildLeaderChallengeSummary,
  decideActivation,
  decideParticipantFinal,
  decideTransition,
  finalizeParticipants,
} from './lifecycle-run';
import { evaluateLeaderBadgeIds } from './leader-badge-grant';
import { buildBadgeGrantItems, buildSpecificBadgeItem } from './badge-grant';

// KST 고정 판정 — 2026-07-21 12:00 KST = 03:00 UTC
const NOW = new Date('2026-07-21T03:00:00.000Z');

const challenge = (over: Record<string, unknown> = {}) => ({
  challengeId: 'c1',
  category: 'discipline',
  lifecycle: 'recruiting',
  durationDays: 7,
  challengeStartAt: '2026-07-25T00:00:00.000Z',
  ...over,
});

describe('decideTransition (resolveDueLifecycle + canTransition)', () => {
  test('recruiting before start date stays', () => {
    expect(decideTransition(challenge(), NOW)).toEqual({ action: 'none' });
  });

  test('recruiting at start date jumps directly to active (허용 전이)', () => {
    const d = decideTransition(
      challenge({ challengeStartAt: '2026-07-21T00:00:00.000Z' }),
      NOW,
    );
    expect(d).toEqual({ action: 'transition', steps: ['active'] });
  });

  // 회귀: 생성 라우트는 모집 시작 시각을 recruitingStartAt로 저장한다.
  // 이 별칭을 리졸버가 못 읽으면 예약 모집 오픈이 안 돼 draft에 갇히고 탐색에 안 뜬다.
  test('draft with elapsed recruitingStartAt auto-opens to recruiting (별칭 승계)', () => {
    const d = decideTransition(
      challenge({
        lifecycle: 'draft',
        recruitingStartAt: '2026-07-20T00:00:00.000Z', // NOW(03:00Z 21일) 이전
        challengeStartAt: '2026-07-25T00:00:00.000Z',
      }),
      NOW,
    );
    expect(d).toEqual({ action: 'transition', steps: ['recruiting'] });
  });

  test('draft with future recruitingStartAt stays draft', () => {
    const d = decideTransition(
      challenge({
        lifecycle: 'draft',
        recruitingStartAt: '2026-07-23T00:00:00.000Z', // 아직 미래
        challengeStartAt: '2026-07-25T00:00:00.000Z',
      }),
      NOW,
    );
    expect(d).toEqual({ action: 'none' });
  });

  test('preparing at start date transitions to active', () => {
    const d = decideTransition(
      challenge({ lifecycle: 'preparing', challengeStartAt: '2026-07-20T23:00:00.000Z' }),
      NOW,
    );
    expect(d).toEqual({ action: 'transition', steps: ['active'] });
  });

  test('preparing whose whole period elapsed goes two-step active→completed', () => {
    const d = decideTransition(
      challenge({ lifecycle: 'preparing', challengeStartAt: '2026-07-01T00:00:00.000Z' }),
      NOW,
    );
    expect(d).toEqual({ action: 'transition', steps: ['active', 'completed'] });
  });

  test('active past durationDays completes', () => {
    const d = decideTransition(
      challenge({ lifecycle: 'active', challengeStartAt: '2026-07-10T00:00:00.000Z' }),
      NOW,
    );
    expect(d).toEqual({ action: 'transition', steps: ['completed'] });
  });

  test('active within duration stays (시작일=Day0, KST 기준)', () => {
    const d = decideTransition(
      // 시작 2026-07-15 KST → 7/21은 elapsed 6 < 7
      challenge({ lifecycle: 'active', challengeStartAt: '2026-07-15T00:00:00.000Z' }),
      NOW,
    );
    expect(d).toEqual({ action: 'none' });
  });

  test('requireStartConfirmation without confirmation holds at preparing', () => {
    const d = decideTransition(
      challenge({
        lifecycle: 'preparing',
        challengeStartAt: '2026-07-20T00:00:00.000Z',
        requireStartConfirmation: true,
      }),
      NOW,
    );
    expect(d).toEqual({ action: 'hold', reason: 'awaiting_start_confirmation' });
  });

  test('requireStartConfirmation with startConfirmedAt proceeds (확인 시각이 실제 시작 기준)', () => {
    const d = decideTransition(
      challenge({
        lifecycle: 'preparing',
        challengeStartAt: '2026-07-18T00:00:00.000Z',
        requireStartConfirmation: true,
        startConfirmedAt: '2026-07-20T01:00:00.000Z',
      }),
      NOW,
    );
    expect(d).toEqual({ action: 'transition', steps: ['active'] });
  });

  test('actualStartAt takes precedence over challengeStartAt (지연 시작 후 완료 판정)', () => {
    const d = decideTransition(
      challenge({
        lifecycle: 'active',
        challengeStartAt: '2026-07-01T00:00:00.000Z',
        actualStartAt: '2026-07-16T00:00:00.000Z', // elapsed 5 < 7 → 유지
      }),
      NOW,
    );
    expect(d).toEqual({ action: 'none' });
  });

  test('draft/archived are never time-transitioned', () => {
    expect(decideTransition(challenge({ lifecycle: 'draft', challengeStartAt: '2026-07-01T00:00:00.000Z' }), NOW))
      .toEqual({ action: 'none' });
    expect(decideTransition(challenge({ lifecycle: 'archived', challengeStartAt: '2026-07-01T00:00:00.000Z' }), NOW))
      .toEqual({ action: 'none' });
  });
});

describe('decideActivation (레거시 activateUserChallenges + 미승인 자동 거절)', () => {
  test('approved preparing participant activates', () => {
    expect(decideActivation({ phase: 'preparing', joinStatus: 'approved' })).toBe('activate');
  });
  test('participant without joinStatus activates (레거시 attribute_not_exists 승계)', () => {
    expect(decideActivation({ phase: 'preparing' })).toBe('activate');
  });
  test('requested participant is auto-rejected', () => {
    expect(decideActivation({ phase: 'preparing', joinStatus: 'requested' })).toBe('reject');
  });
  test('non-preparing phases are untouched', () => {
    expect(decideActivation({ phase: 'active', joinStatus: 'approved' })).toBe('skip');
    expect(decideActivation({ phase: 'failed', joinStatus: 'requested' })).toBe('skip');
  });
});

describe('finalize participants (완주/실패 판정)', () => {
  const day = (d: number, status: string) => ({ day: d, status, score: 1, remedied: false });

  test('7/7 completed days → completed (remedy도 완료로 집계)', () => {
    const progress = [
      day(1, 'success'), day(2, 'completed'), day(3, 'remedy'), day(4, 'success'),
      day(5, 'success'), day(6, 'success'), day(7, 'success'),
    ];
    const d = decideParticipantFinal({ userId: 'u1', phase: 'active', progress }, 7);
    expect(d).toEqual({ userId: 'u1', finalStatus: 'completed', completedDays: 7 });
  });

  test('missing days → failed (partial/failed는 미완료)', () => {
    const progress = [day(1, 'success'), day(2, 'partial'), day(3, 'failed')];
    const d = decideParticipantFinal({ userId: 'u2', phase: 'active', progress }, 7);
    expect(d).toEqual({ userId: 'u2', finalStatus: 'failed', completedDays: 1 });
  });

  test('non-active phases are skipped', () => {
    expect(decideParticipantFinal({ userId: 'u3', phase: 'preparing', progress: [] }, 7)).toBeNull();
    expect(decideParticipantFinal({ userId: 'u4', phase: 'failed', progress: [] }, 7)).toBeNull();
  });

  test('finalizeParticipants collects completedUserIds for the event detail', () => {
    const full = Array.from({ length: 7 }, (_, i) => day(i + 1, 'success'));
    const { finals, completedUserIds } = finalizeParticipants(
      [
        { userId: 'winner', phase: 'active', progress: full },
        { userId: 'loser', phase: 'active', progress: [day(1, 'success')] },
        { userId: 'ghost', phase: 'preparing', progress: [] },
      ],
      7,
    );
    expect(finals).toHaveLength(2);
    expect(completedUserIds).toEqual(['winner']);
  });
});

describe('leader badge evaluation (which badges)', () => {
  const summaryOf = (over: Record<string, unknown> = {}) =>
    buildLeaderChallengeSummary(
      { challengeId: 'c1', lifecycle: 'completed', durationDays: 7, createdAt: '2026-05-01T00:00:00.000Z', ...over },
      [
        { userId: 'a', phase: 'completed', status: 'completed' },
        { userId: 'b', phase: 'failed', status: 'failed' },
        { userId: 'c', phase: 'active', status: 'active' }, // 미확정 — 집계 제외 (레거시 filter 승계)
      ],
    );

  test('buildLeaderChallengeSummary counts only finalized participants', () => {
    const s = summaryOf();
    expect(s.participantCount).toBe(2);
    expect(s.completedParticipants).toBe(1);
    expect(s.completionRate).toBe(0.5);
  });

  test('first completed challenge grants leader-debut only', () => {
    expect(evaluateLeaderBadgeIds([summaryOf()], 'c1')).toEqual(['leader-debut']);
  });

  test('3 high-quality challenges in consecutive months add leader-active + leader-streak', () => {
    const summaries = ['2026-04-01', '2026-05-01', '2026-06-01'].map((iso, i) =>
      buildLeaderChallengeSummary(
        { challengeId: `c${i}`, lifecycle: 'completed', durationDays: 7, createdAt: `${iso}T00:00:00.000Z` },
        [{ userId: 'a', phase: 'completed', status: 'completed' }],
      ),
    );
    const ids = evaluateLeaderBadgeIds(summaries, 'c0');
    expect(ids).toContain('leader-debut');
    expect(ids).toContain('leader-active');
    expect(ids).toContain('leader-streak');
    expect(ids).not.toContain('leader-expert');
  });
});

describe('badge item shape (gamification 키 계약)', () => {
  test('buildSpecificBadgeItem uses USER#/BADGE# keys + gsi1 (조건부 Put attribute_not_exists(pk) 대상)', () => {
    const item = buildSpecificBadgeItem(
      { badgeId: 'leader-debut', userId: 'u1', challengeId: 'c1', metadata: { source: 'leader' } },
      NOW,
    );
    expect(item.pk).toBe('USER#u1');
    expect(item.sk).toBe('BADGE#leader-debut');
    expect(item.gsi1pk).toBe('BADGE#leader-debut');
    expect(item.gsi1sk).toBe(NOW.toISOString());
    expect(item.source).toBe('leader');
  });

  test('buildBadgeGrantItems keeps verification-time streak rules (사본 회귀 가드)', () => {
    const items = buildBadgeGrantItems(
      { userId: 'u1', challengeId: 'c1', verificationId: 'v1', day: 7, consecutiveDays: 7 },
      NOW,
    );
    expect(items.map((i) => i.badgeId).sort()).toEqual(['7-day-master']);
  });
});
