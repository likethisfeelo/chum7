import { calculateChallengeDay, certDateFromIso, isInvalidDayDelta, remedyScore, validatePracticeAt } from '../backend/shared/lib/challenge-quest-policy';

describe('challenge-quest-policy', () => {
  test('practiceAt future should fail', () => {
    const res = validatePracticeAt('2026-01-01T10:01:00.000Z', '2026-01-01T10:00:00.000Z', 'Asia/Seoul');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe('FUTURE_PRACTICE_TIME');
  });

  test('practiceAt too old should fail', () => {
    const res = validatePracticeAt('2025-12-31T14:59:59.000Z', '2026-01-01T10:00:00.000Z', 'Asia/Seoul');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe('PRACTICE_TOO_OLD');
  });

  test('certDate should follow timezone boundary', () => {
    const cert = certDateFromIso('2026-01-01T15:30:00.000Z', 'Asia/Seoul');
    expect(cert).toBe('2026-01-02');
  });

  test('challenge day calculation', () => {
    const certDate = '2026-01-03';
    const day = calculateChallengeDay('2026-01-01T00:00:00.000Z', certDate, 'Asia/Seoul');
    expect(day).toBe(3);
    expect(isInvalidDayDelta(1, day)).toBe(true);
  });

  test('remedy score should floor 70%', () => {
    expect(remedyScore(10)).toBe(7);
    expect(remedyScore(9)).toBe(6);
  });
});
