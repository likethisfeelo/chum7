import { resolveNormalizedChallengeState } from '../../backend/shared/lib/challenge-state';

describe('resolveNormalizedChallengeState', () => {
  test('auto finalizes to completed when lifecycle ended and completedDays reached duration', () => {
    const result = resolveNormalizedChallengeState({
      status: 'active',
      phase: 'active',
      challengeLifecycle: 'completed',
      effectiveCurrentDay: 8,
      durationDays: 7,
      completedDays: 7,
    });

    expect(result).toEqual({ status: 'completed', phase: 'completed' });
  });

  test('auto finalizes to failed when period ended without enough completed days', () => {
    const result = resolveNormalizedChallengeState({
      status: 'active',
      phase: 'active',
      challengeLifecycle: 'active',
      effectiveCurrentDay: 8,
      durationDays: 7,
      completedDays: 6,
    });

    expect(result).toEqual({ status: 'failed', phase: 'failed' });
  });

  test('keeps terminal state unchanged', () => {
    const result = resolveNormalizedChallengeState({
      status: 'completed',
      phase: 'completed',
      challengeLifecycle: 'active',
      effectiveCurrentDay: 3,
      durationDays: 7,
      completedDays: 3,
    });

    expect(result).toEqual({ status: 'completed', phase: 'completed' });
  });

  test('keeps active state when not period ended', () => {
    const result = resolveNormalizedChallengeState({
      status: 'active',
      phase: 'active',
      challengeLifecycle: 'active',
      effectiveCurrentDay: 4,
      durationDays: 7,
      completedDays: 2,
    });

    expect(result).toEqual({ status: 'active', phase: 'active' });
  });
});
