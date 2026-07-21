import {
  ANIMAL_DICTIONARY,
  createDailyAnonymousId,
  createPersistentAnonymousId,
  toKstDateKey,
} from './anonymous-id';

const SALT = 'test-salt';
const FORMAT_RE = /^[가-힣]+-\d{3}$/;

describe('createDailyAnonymousId', () => {
  const date = new Date('2026-07-21T03:00:00Z');

  it('형식 {동물명}-{3자리숫자} (spec §2)', () => {
    const id = createDailyAnonymousId('c1', 'u1', SALT, date);
    expect(id).toMatch(FORMAT_RE);
    const [animal, num] = id.split('-');
    expect(ANIMAL_DICTIONARY).toContain(animal);
    expect(Number(num)).toBeGreaterThanOrEqual(100);
    expect(Number(num)).toBeLessThanOrEqual(999);
  });

  it('같은 (challengeId, userId, dateKey, salt) => 동일 출력 (spec §8-1)', () => {
    expect(createDailyAnonymousId('c1', 'u1', SALT, date)).toBe(
      createDailyAnonymousId('c1', 'u1', SALT, date),
    );
  });

  it('날짜만 변경 => 다른 출력 (spec §8-2)', () => {
    const other = new Date('2026-07-22T03:00:00Z');
    expect(createDailyAnonymousId('c1', 'u1', SALT, date)).not.toBe(
      createDailyAnonymousId('c1', 'u1', SALT, other),
    );
  });

  it('챌린지만 변경 => 다른 출력 (spec §8-3)', () => {
    expect(createDailyAnonymousId('c1', 'u1', SALT, date)).not.toBe(
      createDailyAnonymousId('c2', 'u1', SALT, date),
    );
  });

  it('KST 자정 경계에서 날짜 키가 바뀐다 (spec §4)', () => {
    // 14:59 UTC = 23:59 KST, 15:00 UTC = 다음날 00:00 KST
    expect(toKstDateKey(new Date('2026-07-21T14:59:00Z'))).toBe('2026-07-21');
    expect(toKstDateKey(new Date('2026-07-21T15:00:00Z'))).toBe('2026-07-22');
  });

  it('salt 미설정 시 ANON_SALT_NOT_CONFIGURED (spec §7)', () => {
    expect(() => createDailyAnonymousId('c1', 'u1', '')).toThrow('ANON_SALT_NOT_CONFIGURED');
  });
});

describe('createPersistentAnonymousId', () => {
  it('날짜와 무관하게 안정적이며 형식이 같다', () => {
    const a = createPersistentAnonymousId('c1', 'u1', SALT);
    expect(a).toMatch(FORMAT_RE);
    expect(createPersistentAnonymousId('c1', 'u1', SALT)).toBe(a);
  });

  it('일별 ID와 입력이 같아도 별도 네임스페이스', () => {
    const daily = createDailyAnonymousId('c1', 'u1', SALT, new Date('2026-07-21T03:00:00Z'));
    const persistent = createPersistentAnonymousId('c1', 'u1', SALT);
    // 해시 네임스페이스가 다르므로 우연 일치 외에는 다르다 (고정 입력으로 검증)
    expect(persistent).not.toBe(daily);
  });
});
