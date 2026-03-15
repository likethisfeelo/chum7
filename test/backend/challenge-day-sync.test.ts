import { calculateEffectiveCurrentDay } from '../../backend/shared/lib/challenge-day-sync';

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
