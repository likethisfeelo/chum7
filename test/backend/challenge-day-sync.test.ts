import { calculateChallengeEndAt, calculateEffectiveCurrentDay, resolveChallengeActualStartAt } from '../../backend/shared/lib/challenge-day-sync';

describe('calculateEffectiveCurrentDay', () => {
  test('syncs in_progress challenge states using stored startDate', () => {
    const day = calculateEffectiveCurrentDay(
      {
        currentDay: 1,
        phase: 'in_progress',
        status: 'in_progress',
        startDate: '2025-01-01',
      },
      '2025-01-03T09:00:00.000Z',
      7,
    );

    expect(day).toBeGreaterThanOrEqual(3);
  });

  test('falls back to challengeStartAt when userChallenge.startDate is missing', () => {
    const day = calculateEffectiveCurrentDay(
      {
        currentDay: 1,
        phase: 'active',
        status: 'active',
        challengeStartAt: '2025-01-01T00:00:00.000Z',
      },
      '2025-01-03T09:00:00.000Z',
      7,
    );

    expect(day).toBeGreaterThanOrEqual(3);
  });

  test('does not sync for non-active states', () => {
    const day = calculateEffectiveCurrentDay(
      {
        currentDay: 2,
        phase: 'preparing',
        status: 'active',
        startDate: '2025-01-01',
      },
      '2025-01-03T09:00:00.000Z',
      7,
    );

    expect(day).toBe(2);
  });
});


describe('challenge schedule helpers', () => {
  test('resolveChallengeActualStartAt prefers actualStartAt then startConfirmedAt then challengeStartAt', () => {
    expect(resolveChallengeActualStartAt({ actualStartAt: '2025-01-01T00:00:00.000Z', startConfirmedAt: '2025-01-02T00:00:00.000Z', challengeStartAt: '2025-01-03T00:00:00.000Z' })).toBe('2025-01-01T00:00:00.000Z');
    expect(resolveChallengeActualStartAt({ startConfirmedAt: '2025-01-02T00:00:00.000Z', challengeStartAt: '2025-01-03T00:00:00.000Z' })).toBe('2025-01-02T00:00:00.000Z');
    expect(resolveChallengeActualStartAt({ challengeStartAt: '2025-01-03T00:00:00.000Z' })).toBe('2025-01-03T00:00:00.000Z');
  });

  test('calculateChallengeEndAt adds duration days from actual start', () => {
    expect(calculateChallengeEndAt('2025-01-01T12:00:00.000Z', 7)).toBe('2025-01-08T12:00:00.000Z');
    expect(calculateChallengeEndAt('2025-01-01T00:00:00.000Z', 10)).toBe('2025-01-11T00:00:00.000Z');
  });
});
