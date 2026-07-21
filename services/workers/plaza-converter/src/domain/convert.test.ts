import {
  animalIconFor,
  buildHashtagRegistryItem,
  buildPlazaPostItem,
  conversionWindow,
  decideConvert,
  kstDateString,
  resolvePlazaFallbackContent,
} from './convert';

const baseVerification = {
  pk: 'CHAL#c1',
  sk: 'VF#u1#D03#v1',
  verificationId: 'v1',
  userId: 'u1',
  challengeId: 'c1',
  challengeTitle: '아침 조깅',
  challengeCategory: 'health',
  day: 3,
  type: 'normal',
  imageUrl: 'https://img/1.jpg',
  videoUrl: null,
  todayNote: '오늘도 뛰었다',
  tomorrowPromise: '내일도 뛴다',
  createdAt: '2026-07-21T01:23:45.000Z',
};

describe('conversionWindow (KST 파티션 + high-water mark)', () => {
  test('KST today/yesterday partitions (UTC 자정 경계 포함)', () => {
    // 2026-07-20 16:30 UTC = 2026-07-21 01:30 KST
    const now = new Date('2026-07-20T16:30:00.000Z');
    expect(kstDateString(now)).toBe('2026-07-21');
    const w = conversionWindow(now);
    expect(w.partitions).toEqual(['2026-07-21', '2026-07-20']);
  });

  test('high-water mark = now - lookbackHours (기본 26시간)', () => {
    const now = new Date('2026-07-21T10:00:00.000Z');
    expect(conversionWindow(now).sinceIso).toBe('2026-07-20T08:00:00.000Z');
    expect(conversionWindow(now, 2).sinceIso).toBe('2026-07-21T08:00:00.000Z');
  });
});

describe('decideConvert (레거시 스킵 규칙)', () => {
  test('normal + unconverted converts', () => {
    expect(decideConvert(baseVerification)).toEqual({ convert: true });
  });
  test('non-normal types are skipped (extra/remedy 등)', () => {
    expect(decideConvert({ ...baseVerification, type: 'extra' }))
      .toEqual({ convert: false, reason: 'not_normal_type' });
  });
  test('already converted (plazaConvertedAt marker) is skipped', () => {
    expect(decideConvert({ ...baseVerification, plazaConvertedAt: '2026-07-21T00:00:00.000Z' }))
      .toEqual({ convert: false, reason: 'already_converted' });
  });
});

describe('buildPlazaPostItem (social-api PORTING.md §4 아이템 계약)', () => {
  const CONVERTED_AT = '2026-07-21T02:00:00.000Z';

  test('keys and full item shape', () => {
    const item = buildPlazaPostItem(baseVerification, CONVERTED_AT);
    expect(item).toEqual({
      pk: 'POST#courtyard-v1',
      sk: 'META',
      gsi1pk: 'FEED#courtyard',
      gsi1sk: '2026-07-21T01:23:45.000Z',
      plazaPostId: 'courtyard-v1',
      postType: 'courtyard',
      challengeTitle: '아침 조깅',
      challengeCategory: 'health',
      currentDay: 3,
      imageUrl: 'https://img/1.jpg',
      content: '오늘도 뛰었다',
      leaderId: null,
      leaderName: null,
      leaderMessage: null,
      recruitmentData: null,
      sourceType: 'verification',
      sourceId: 'v1',
      sourceChallengeId: 'c1',
      sourceLeaderId: undefined,
      sourceUserId: 'u1',
      likeCount: 0,
      commentCount: 0,
      bookmarkCount: 0,
      isActive: true,
      createdAt: '2026-07-21T01:23:45.000Z',
      originalCreatedAt: '2026-07-21T01:23:45.000Z',
      convertedAt: CONVERTED_AT,
    });
    // hashtag 없음 → gsi2/hashtag 필드 자체가 없어야 한다 (sparse GSI)
    expect('gsi2pk' in item).toBe(false);
    expect('hashtag' in item).toBe(false);
  });

  test('hashtag adds gsi2 TAG# keys + hashtag attr', () => {
    const item = buildPlazaPostItem({ ...baseVerification, hashtag: '아침루틴' }, CONVERTED_AT);
    expect(item.gsi2pk).toBe('TAG#아침루틴');
    expect(item.gsi2sk).toBe('2026-07-21T01:23:45.000Z');
    expect(item.hashtag).toBe('아침루틴');
  });

  test('fallback content chain: todayNote → tomorrowPromise → generated Day → default', () => {
    expect(resolvePlazaFallbackContent(baseVerification))
      .toEqual({ content: '오늘도 뛰었다', source: 'todayNote' });
    expect(resolvePlazaFallbackContent({ ...baseVerification, todayNote: '  ' }))
      .toEqual({ content: '내일도 뛴다', source: 'tomorrowPromise' });
    expect(resolvePlazaFallbackContent({ ...baseVerification, todayNote: null, tomorrowPromise: null }))
      .toEqual({ content: 'Day 3 인증을 완료했어요.', source: 'generatedDay' });
    expect(resolvePlazaFallbackContent({ todayNote: null, tomorrowPromise: null, day: null }))
      .toEqual({ content: '인증을 완료했어요.', source: 'generatedDefault' });
  });

  test('missing media falls back imageUrl → videoUrl → null; 제목 폴백', () => {
    const item = buildPlazaPostItem(
      { ...baseVerification, imageUrl: null, videoUrl: 'https://v/1.mp4', challengeTitle: null },
      CONVERTED_AT,
    );
    expect(item.imageUrl).toBe('https://v/1.mp4');
    expect(item.challengeTitle).toBe('챌린지 기록');
  });

  test('missing createdAt falls back to convertedAt (originalCreatedAt=null)', () => {
    const item = buildPlazaPostItem({ ...baseVerification, createdAt: undefined }, CONVERTED_AT);
    expect(item.gsi1sk).toBe(CONVERTED_AT);
    expect(item.createdAt).toBe(CONVERTED_AT);
    expect(item.originalCreatedAt).toBeNull();
  });
});

describe('hashtag registry item (social repo/hashtags 계약)', () => {
  test('TAG#/META keys + TAGREG gsi1 + 최초 등록 필드', () => {
    const item = buildHashtagRegistryItem('아침루틴', 'u1', '2026-07-21T02:00:00.000Z');
    expect(item).toEqual({
      pk: 'TAG#아침루틴',
      sk: 'META',
      gsi1pk: 'TAGREG',
      gsi1sk: '2026-07-21T02:00:00.000Z',
      hashtag: '아침루틴',
      creatorUserId: 'u1',
      creatorAnimalIcon: animalIconFor('u1'),
      registeredAt: '2026-07-21T02:00:00.000Z',
      creatorPublic: true,
      postCount: 0,
    });
  });

  test('animal icon is deterministic per userId (레거시 문자합 mod 8)', () => {
    expect(animalIconFor('u1')).toBe(animalIconFor('u1'));
    const animals = ['🐰', '🐻', '🦊', '🐼', '🦁', '🐯', '🐨', '🦦'];
    expect(animals).toContain(animalIconFor('someone-else'));
  });
});
