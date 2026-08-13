import { missedDaysFromProgress, normalizeProgress } from './progress';

describe('normalizeProgress', () => {
  test('normalizes object and array formats into sorted deduped records', () => {
    const normalized = normalizeProgress({
      b: { day: 2, status: 'failed', score: '0', remedied: false },
      a: { day: 1, status: 'success', score: '10', verificationId: 'v1' },
      c: { day: 2, status: 'success', score: 5, remedied: true, delta: '3' },
    });

    expect(normalized).toEqual([
      {
        day: 1,
        status: 'success',
        verificationId: 'v1',
        timestamp: undefined,
        delta: null,
        score: 10,
        remedied: false,
      },
      {
        day: 2,
        status: 'success',
        verificationId: undefined,
        timestamp: undefined,
        delta: 3,
        score: 5,
        remedied: true,
      },
    ]);
  });

  test('drops invalid entries and coerces unknown status to null', () => {
    const normalized = normalizeProgress([
      null,
      undefined,
      1,
      { day: 0, status: 'success', score: 9 },
      { day: 'x', status: 'success', score: 9 },
      { day: 3, status: 'weird', score: undefined, delta: undefined },
    ] as any);

    expect(normalized).toEqual([
      {
        day: 3,
        status: null,
        verificationId: undefined,
        timestamp: undefined,
        delta: null,
        score: 0,
        remedied: false,
      },
    ]);
  });
});

/**
 * 회귀 방지: 인증을 한 번도 제출하지 않은 Day는 진행표에 항목이 만들어지지 않는다.
 * 항목만 훑던 구현에서는 그런 날이 실패일로 잡히지 않아 보완 제출이 거부됐다
 * (REMEDY_NO_FAILED_DAYS / REMEDY_TARGET_INVALID).
 */
describe('missedDaysFromProgress', () => {
  test('항목이 없는 Day도 미인증으로 잡는다 (Day1 완료 · 2·3 미제출 · Day4 완료)', () => {
    const progress = normalizeProgress([
      { day: 1, status: 'success', score: 1 },
      { day: 4, status: 'success', score: 1 },
    ]);
    expect(missedDaysFromProgress(progress, 5)).toEqual([2, 3, 5]);
  });

  test('진행표가 비어 있으면 1..maxDay 전부', () => {
    expect(missedDaysFromProgress([], 3)).toEqual([1, 2, 3]);
  });

  test('성공·보완 완료한 날은 제외한다', () => {
    const progress = normalizeProgress([
      { day: 1, status: 'success', score: 1 },
      { day: 2, status: 'failed', score: 0, remedied: true },
      { day: 3, status: 'partial', score: 0 },
    ]);
    expect(missedDaysFromProgress(progress, 3)).toEqual([3]);
  });

  test('maxDay 를 넘는 Day 는 포함하지 않는다 (last_day 정책의 regularDays)', () => {
    expect(missedDaysFromProgress([], 4)).toEqual([1, 2, 3, 4]);
  });
});
