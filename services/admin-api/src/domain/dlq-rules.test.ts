import {
  computeRequeueFields,
  dayPartitions,
  normalizeCheerIds,
  parseIsoOrNull,
  resolveIsoRange,
} from './dlq-rules';

describe('domain/dlq-rules', () => {
  const now = new Date('2026-07-21T12:00:00.000Z');

  it('parseIsoOrNull — 유효 ISO만 정규화', () => {
    expect(parseIsoOrNull('2026-07-01T00:00:00Z')).toBe('2026-07-01T00:00:00.000Z');
    expect(parseIsoOrNull('nope')).toBeNull();
    expect(parseIsoOrNull(undefined)).toBeNull();
  });

  describe('resolveIsoRange', () => {
    it('기본값 — 최근 7일', () => {
      const { range, error } = resolveIsoRange(undefined, undefined, now);
      expect(error).toBeUndefined();
      expect(range).toEqual({
        fromIso: '2026-07-14T12:00:00.000Z',
        toIso: '2026-07-21T12:00:00.000Z',
      });
    });

    it('잘못된 형식 → error', () => {
      expect(resolveIsoRange('bad', undefined, now).error).toBeDefined();
    });

    it('from > to → error', () => {
      expect(resolveIsoRange('2026-07-22T00:00:00Z', '2026-07-21T00:00:00Z', now).error).toBeDefined();
    });
  });

  it('dayPartitions — 최신일 우선 일자 목록', () => {
    const days = dayPartitions({ fromIso: '2026-07-19T05:00:00.000Z', toIso: '2026-07-21T01:00:00.000Z' });
    expect(days).toEqual(['2026-07-21', '2026-07-20', '2026-07-19']);
  });

  it('dayPartitions — maxDays 상한', () => {
    const days = dayPartitions({ fromIso: '2026-01-01T00:00:00.000Z', toIso: '2026-07-21T00:00:00.000Z' }, 5);
    expect(days).toHaveLength(5);
    expect(days[0]).toBe('2026-07-21');
  });

  it('computeRequeueFields — now + 60초 예약', () => {
    expect(computeRequeueFields(now)).toEqual({
      nowIso: '2026-07-21T12:00:00.000Z',
      scheduledTime: '2026-07-21T12:01:00.000Z',
    });
  });

  it('normalizeCheerIds — trim·중복 제거·비배열 방어', () => {
    expect(normalizeCheerIds([' a ', 'b', 'a', '', null])).toEqual(['a', 'b']);
    expect(normalizeCheerIds('a')).toEqual([]);
  });
});
