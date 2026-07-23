import { bulletinDisplayName, bulletinView } from './bulletin-view';

const SALT = 'test-salt';

describe('bulletinView — 프라이버시 불변식', () => {
  const post = {
    pk: 'BULLETIN#c1#active',
    sk: 'POST#2026-01-01#p1',
    gsi1pk: 'x',
    postId: 'p1',
    challengeId: 'c1',
    userId: 'u-secret',
    authorDisplayName: '수달42',
    content: { text: '안녕' },
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('응답에 실 userId·내부 키가 절대 포함되지 않는다', () => {
    const view = bulletinView(post, 'viewer', SALT);
    expect(view.userId).toBeUndefined();
    expect(view.pk).toBeUndefined();
    expect(view.sk).toBeUndefined();
    expect(view.gsi1pk).toBeUndefined();
    // 본문·표시용 필드는 유지
    expect(view.postId).toBe('p1');
    expect(view.content).toEqual({ text: '안녕' });
  });

  it('저장된 활동명 스냅샷을 우선 사용한다', () => {
    expect(bulletinView(post, 'viewer', SALT).displayName).toBe('수달42');
  });

  it('스냅샷이 없으면 createdAt 날짜 기준으로 재계산(하위호환) — userId 없이 안정적', () => {
    const legacy = { ...post, authorDisplayName: undefined };
    const name = bulletinDisplayName(legacy, SALT);
    expect(typeof name).toBe('string');
    expect(name).not.toBe('익명');
    // 결정론적 — 같은 입력 같은 출력
    expect(bulletinDisplayName(legacy, SALT)).toBe(name);
  });

  it('isMine은 조회자와 작성자 userId 일치일 때만 true', () => {
    expect(bulletinView(post, 'u-secret', SALT).isMine).toBe(true);
    expect(bulletinView(post, 'other', SALT).isMine).toBe(false);
    expect(bulletinView(post, undefined, SALT).isMine).toBe(false);
  });

  it('userId·challengeId 없으면 익명 폴백', () => {
    expect(bulletinDisplayName({ createdAt: '2026-01-01' }, SALT)).toBe('익명');
  });
});
