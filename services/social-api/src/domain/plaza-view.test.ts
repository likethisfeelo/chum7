import { sanitizePost } from './plaza-view';

describe('sanitizePost — 신원 필드 제거 계약 (P0-2)', () => {
  const rawPost = {
    postId: 'p1',
    content: '안녕하세요',
    postType: 'recruitment',
    createdAt: '2026-07-23T00:00:00.000Z',
    // 내부/신원 필드 — 퍼블릭 응답에서 노출 금지
    authorId: 'user-123',
    sourceUserId: 'user-123',
    sourceId: 'ver-9',
    sourceType: 'verification',
    sourceChallengeId: 'chal-1',
    sourceLeaderId: 'leader-7',
    exposureScore: 42,
    _score: 1.5,
  };

  it('실제 작성자 식별자를 응답에서 제거한다', () => {
    const safe = sanitizePost(rawPost);
    expect(safe.authorId).toBeUndefined();
    expect(safe.sourceUserId).toBeUndefined();
    expect(safe.sourceLeaderId).toBeUndefined();
    expect(safe.sourceId).toBeUndefined();
    expect(safe.sourceType).toBeUndefined();
    // 내부 점수도 제거
    expect(safe.exposureScore).toBeUndefined();
    expect(safe._score).toBeUndefined();
  });

  it('공개 가능한 콘텐츠 필드는 유지한다', () => {
    const safe = sanitizePost(rawPost);
    expect(safe.postId).toBe('p1');
    expect(safe.content).toBe('안녕하세요');
    expect(safe.postType).toBe('recruitment');
    // challengeId는 source 폴백으로 채워진다(공개 허용)
    expect(safe.challengeId).toBe('chal-1');
  });

  it('어떤 값에도 실제 userId 문자열이 남지 않는다', () => {
    const safe = sanitizePost(rawPost);
    expect(JSON.stringify(safe)).not.toContain('user-123');
  });
});
