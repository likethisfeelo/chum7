import { evaluateBadgeIds } from '../../backend/shared/lib/badge';

describe('badge grant evaluateBadgeIds', () => {
  test('grants 3-day-streak on 3 consecutive days', () => {
    expect(evaluateBadgeIds({ day: 3, consecutiveDays: 3, isRemedy: false })).toEqual(['3-day-streak']);
  });

  test('grants 7-day-master only on day 7 with full streak', () => {
    expect(evaluateBadgeIds({ day: 7, consecutiveDays: 7, isRemedy: false })).toEqual(['7-day-master']);
  });

  test('grants none for remedy submission', () => {
    expect(evaluateBadgeIds({ day: 7, consecutiveDays: 7, isRemedy: true })).toEqual([]);
  });
});
