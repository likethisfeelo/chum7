import { isValidHandle, nextHandleChangeAt, normalizeHandle } from './handle';

describe('normalizeHandle / isValidHandle', () => {
  it('트림·소문자화 후 검증한다', () => {
    expect(normalizeHandle('  MyHandle ')).toBe('myhandle');
    expect(isValidHandle('myhandle')).toBe(true);
    expect(isValidHandle('abc_123')).toBe(true);
  });

  it('숫자/_ 시작, 3자 미만, 21자 이상, 허용 외 문자는 거부', () => {
    expect(isValidHandle('1abc')).toBe(false);
    expect(isValidHandle('_abc')).toBe(false);
    expect(isValidHandle('ab')).toBe(false);
    expect(isValidHandle('a'.repeat(21))).toBe(false);
    expect(isValidHandle('한글핸들')).toBe(false);
    expect(isValidHandle('ABC')).toBe(false); // 정규화 전 대문자
  });
});

describe('nextHandleChangeAt', () => {
  const now = new Date('2026-07-21T00:00:00.000Z');

  it('최초 설정(기록 없음)은 항상 허용', () => {
    expect(nextHandleChangeAt(undefined, now)).toBeNull();
  });

  it('30일 미만이면 다음 변경 가능 시각 반환', () => {
    const last = '2026-07-01T00:00:00.000Z';
    const next = nextHandleChangeAt(last, now);
    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });

  it('30일 경과 시 허용', () => {
    expect(nextHandleChangeAt('2026-06-01T00:00:00.000Z', now)).toBeNull();
  });
});
