import {
  countParticipatedDays,
  isVerificationDayCompleted,
  resolveChallengeBucket,
  resolveChallengeDay,
  resolveChallengeDurationDays,
  resolveChallengeId,
  resolveUserChallengeId,
} from '../frontend/src/features/challenge/utils/challengeLifecycle';

describe('frontend challengeLifecycle utils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-20T09:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('resolveChallengeBucket applies completion priority first', () => {
    const completed = resolveChallengeBucket({
      status: 'completed',
      phase: 'active',
      challenge: { lifecycle: 'active' },
    });
    const failed = resolveChallengeBucket({
      status: 'failed',
      phase: 'active',
      challenge: { lifecycle: 'active' },
    });

    expect(completed).toBe('completed');
    expect(failed).toBe('completed');
  });

  test('resolveChallengeBucket returns pending for recruiting/preparing', () => {
    expect(resolveChallengeBucket({ phase: 'preparing', challenge: { lifecycle: 'active' } })).toBe('pending');
    expect(resolveChallengeBucket({ phase: 'active', challenge: { lifecycle: 'recruiting' } })).toBe('pending');
  });

  test('resolveChallengeDurationDays prefers challenge.durationDays then progress length then fallback', () => {
    expect(resolveChallengeDurationDays({ challenge: { durationDays: 10 }, progress: [{}, {}] })).toBe(10);
    expect(resolveChallengeDurationDays({ progress: [{}, {}, {}] })).toBe(3);
    expect(resolveChallengeDurationDays({ progress: [] })).toBe(7);
  });

  test('resolveChallengeDay uses max(stored, elapsed) while active', () => {
    const day = resolveChallengeDay({
      currentDay: 2,
      phase: 'active',
      status: 'active',
      startDate: '2026-03-18',
      challenge: { lifecycle: 'active', durationDays: 7 },
    });

    expect(day).toBe(3);
  });

  test('resolveChallengeDay keeps stored value when syncing is not allowed', () => {
    const day = resolveChallengeDay({
      currentDay: 4,
      phase: 'preparing',
      status: 'active',
      startDate: '2026-03-18',
      challenge: { lifecycle: 'preparing', durationDays: 7 },
    });

    expect(day).toBe(4);
  });

  test('resolveChallengeDay falls back to day 1 when currentDay is invalid', () => {
    const day = resolveChallengeDay({
      currentDay: 'not-a-number',
      phase: 'preparing',
      challenge: { lifecycle: 'preparing', durationDays: 7 },
    });

    expect(day).toBe(1);
  });

  test('countParticipatedDays deduplicates completed progress by day', () => {
    const challenge = {
      progress: [
        { day: 1, status: 'SUCCESS' },
        { day: 1, status: 'remedy' },
        { day: 2, status: 'failed' },
        { day: 2, status: 'pending' },
        { status: 'success' },
      ],
    };

    expect(isVerificationDayCompleted('SUCCESS')).toBe(true);
    expect(countParticipatedDays(challenge)).toBe(3);
  });



  test('resolveChallengeId prefers top-level then nested challenge id', () => {
    expect(resolveChallengeId({ challengeId: 'top-level-id', challenge: { challengeId: 'nested-id' } })).toBe('top-level-id');
    expect(resolveChallengeId({ challenge: { challengeId: 'nested-id' } })).toBe('nested-id');
  });

  test('resolveUserChallengeId falls back to challenge id when userChallengeId missing', () => {
    expect(resolveUserChallengeId({ userChallengeId: 'user-challenge-id', challengeId: 'challenge-id' })).toBe('user-challenge-id');
    expect(resolveUserChallengeId({ challengeId: 'challenge-id' })).toBe('challenge-id');
  });

  test('countParticipatedDays and completion status include success/remedy/failed', () => {
    const challenge = {
      progress: [
        { status: 'success' },
        { status: 'remedy' },
        { status: 'failed' },
        { status: 'pending' },
      ],
    };

    expect(isVerificationDayCompleted('success')).toBe(true);
    expect(isVerificationDayCompleted('remedy')).toBe(true);
    expect(isVerificationDayCompleted('failed')).toBe(true);
    expect(isVerificationDayCompleted('pending')).toBe(false);
    expect(countParticipatedDays(challenge)).toBe(3);
  });
});
