import {
  calculateChallengeEndAt,
  calculateEffectiveCurrentDay,
  isCompletedProgressStatus,
  isRemedyWindowClosed,
  resolveChallengeActualStartAt,
} from './day-sync';

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

describe('isCompletedProgressStatus', () => {
  test('treats completed/success/remedy as completed progress', () => {
    expect(isCompletedProgressStatus('completed')).toBe(true);
    expect(isCompletedProgressStatus('success')).toBe(true);
    expect(isCompletedProgressStatus('remedy')).toBe(true);
  });

  test('does not treat failed/pending as completed progress', () => {
    expect(isCompletedProgressStatus('failed')).toBe(false);
    expect(isCompletedProgressStatus('pending')).toBe(false);
  });
});

describe('isRemedyWindowClosed', () => {
  test('기간 내(마지막 날 포함)에는 보완 창이 열려 있다', () => {
    expect(isRemedyWindowClosed(1, 5)).toBe(false);
    expect(isRemedyWindowClosed(4, 5)).toBe(false);
    expect(isRemedyWindowClosed(5, 5)).toBe(false);
  });

  test('기간이 지나면 즉시 닫힌다 — 유예 없음', () => {
    expect(isRemedyWindowClosed(6, 5)).toBe(true);
    expect(isRemedyWindowClosed(30, 5)).toBe(true);
  });

  test('durationDays가 비정상이면 기본 7일 기준으로 판정한다', () => {
    expect(isRemedyWindowClosed(7, 0)).toBe(false);
    expect(isRemedyWindowClosed(8, undefined as unknown as number)).toBe(true);
  });
});
