import { normalizeProgress } from '../../backend/shared/lib/progress';

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
