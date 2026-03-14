import { calculateEffectiveCurrentDay, calculateSyncedCurrentDay, clampDay, resolveDurationDays } from '../backend/shared/lib/challenge-day-sync';

describe('challenge lifecycle currentDay sync helpers', () => {
  test('clampDay bounds to 1..duration+1', () => {
    expect(clampDay(-5, 7)).toBe(1);
    expect(clampDay(1, 7)).toBe(1);
    expect(clampDay(7, 7)).toBe(7);
    expect(clampDay(8, 7)).toBe(8);
    expect(clampDay(99, 7)).toBe(8);
  });

  test('calculateSyncedCurrentDay respects Asia/Seoul service date', () => {
    const day = calculateSyncedCurrentDay(
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T15:30:00.000Z',
      'Asia/Seoul',
      7,
    );

    expect(day).toBe(3);
  });

  test('calculateSyncedCurrentDay falls back to default timezone when invalid', () => {
    const day = calculateSyncedCurrentDay(
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T12:00:00.000Z',
      'Invalid/Timezone',
      7,
    );

    expect(day).toBe(1);
  });


  test('resolveDurationDays prefers challenge duration then progress length', () => {
    expect(resolveDurationDays(10, [{ day: 1 }], 7)).toBe(10);
    expect(resolveDurationDays('10', [{ day: 1 }], 7)).toBe(10);
    expect(resolveDurationDays(undefined, [{ day: 1 }, { day: 2 }], 7)).toBe(2);
    expect(resolveDurationDays(undefined, { a: { day: 1 }, b: { day: 2 } }, 7)).toBe(2);
    expect(resolveDurationDays(0, [{ day: 1 }, { day: 2 }], 7)).toBe(2);
    expect(resolveDurationDays(undefined, null, 7)).toBe(7);
  });

  test('calculateEffectiveCurrentDay returns synced max only for active challenge', () => {
    const nowIso = '2026-01-02T15:30:00.000Z';
    const active = calculateEffectiveCurrentDay(
      {
        currentDay: 1,
        phase: 'active',
        status: 'active',
        startDate: '2026-01-01T00:00:00.000Z',
        timezone: 'Asia/Seoul',
      },
      nowIso,
      7,
    );

    const inactive = calculateEffectiveCurrentDay(
      {
        currentDay: 1,
        phase: 'preparing',
        status: 'active',
        startDate: '2026-01-01T00:00:00.000Z',
        timezone: 'Asia/Seoul',
      },
      nowIso,
      7,
    );

    expect(active).toBe(3);
    expect(inactive).toBe(1);
  });

  test('calculateEffectiveCurrentDay sanitizes invalid stored currentDay', () => {
    const nowIso = '2026-01-02T15:30:00.000Z';

    const active = calculateEffectiveCurrentDay(
      {
        currentDay: 'bad-value',
        phase: 'active',
        status: 'active',
        startDate: '2026-01-01T00:00:00.000Z',
        timezone: 'Asia/Seoul',
      },
      nowIso,
      7,
    );

    const inactive = calculateEffectiveCurrentDay(
      {
        currentDay: 'bad-value',
        phase: 'preparing',
        status: 'active',
      },
      nowIso,
      7,
    );

    expect(active).toBe(3);
    expect(inactive).toBe(1);
  });


  test('calculateEffectiveCurrentDay clamps overlarge stored currentDay to duration upper bound', () => {
    const nowIso = '2026-01-02T15:30:00.000Z';

    const inactive = calculateEffectiveCurrentDay(
      {
        currentDay: 999,
        phase: 'preparing',
        status: 'active',
      },
      nowIso,
      7,
    );

    expect(inactive).toBe(8);
  });

  test('calculateSyncedCurrentDay clamps beyond challenge duration', () => {
    const day = calculateSyncedCurrentDay(
      '2026-01-01T00:00:00.000Z',
      '2026-01-15T00:00:00.000Z',
      'Asia/Seoul',
      7,
    );

    expect(day).toBe(8);
  });
});
