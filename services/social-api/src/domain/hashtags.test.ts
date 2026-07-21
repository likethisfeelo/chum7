import { extractHashtags, normalizeHashtag, resolvePrimaryHashtag } from './hashtags';

describe('normalizeHashtag', () => {
  it('선행 #과 공백을 제거한다', () => {
    expect(normalizeHashtag('#미라클모닝')).toBe('미라클모닝');
    expect(normalizeHashtag('##run ')).toBe('run');
  });

  it('빈 값·null은 null', () => {
    expect(normalizeHashtag('')).toBeNull();
    expect(normalizeHashtag(null)).toBeNull();
    expect(normalizeHashtag('#')).toBeNull();
  });

  it('허용 문자(한글/영문/숫자/_-) 외 포함 시 null', () => {
    expect(normalizeHashtag('tag!')).toBeNull();
    expect(normalizeHashtag('두 단어')).toBeNull();
    expect(normalizeHashtag('ok_tag-1')).toBe('ok_tag-1');
  });

  it('30자 초과는 null (레거시 max 30 승계)', () => {
    expect(normalizeHashtag('a'.repeat(30))).toBe('a'.repeat(30));
    expect(normalizeHashtag('a'.repeat(31))).toBeNull();
  });
});

describe('extractHashtags', () => {
  it('본문에서 태그를 등장 순서대로 추출한다', () => {
    expect(extractHashtags('오늘도 #미라클모닝 성공! #7일챌린지 화이팅')).toEqual([
      '미라클모닝',
      '7일챌린지',
    ]);
  });

  it('중복 태그는 1회만', () => {
    expect(extractHashtags('#run #run #walk')).toEqual(['run', 'walk']);
  });

  it('태그 없는 본문·빈 본문은 빈 배열', () => {
    expect(extractHashtags('태그 없음')).toEqual([]);
    expect(extractHashtags('')).toEqual([]);
    expect(extractHashtags(null)).toEqual([]);
  });
});

describe('resolvePrimaryHashtag', () => {
  it('명시 태그가 있으면 대표 태그로 우선한다', () => {
    const r = resolvePrimaryHashtag('#명시', '본문 #본문태그');
    expect(r.primary).toBe('명시');
    expect(r.all).toEqual(['명시', '본문태그']);
  });

  it('명시 태그가 없으면 본문 첫 태그', () => {
    const r = resolvePrimaryHashtag(undefined, '본문 #첫태그 #둘째');
    expect(r.primary).toBe('첫태그');
    expect(r.all).toEqual(['첫태그', '둘째']);
  });

  it('둘 다 없으면 primary null', () => {
    const r = resolvePrimaryHashtag(null, '태그 없음');
    expect(r.primary).toBeNull();
    expect(r.all).toEqual([]);
  });

  it('명시 태그가 본문에도 있으면 중복 없이 유지', () => {
    const r = resolvePrimaryHashtag('run', '#run 완료');
    expect(r.primary).toBe('run');
    expect(r.all).toEqual(['run']);
  });
});
