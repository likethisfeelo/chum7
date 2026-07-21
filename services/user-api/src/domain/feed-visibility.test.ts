import {
  deriveFollowStatus,
  layerForPosts,
  makeFollowId,
  parseFollowId,
  resolveLayer,
  visibilityAccessible,
  LayerInput,
} from './feed-visibility';

const base: LayerInput = {
  isOwn: false,
  isPublic: false,
  tab02Public: false,
  followStatus: 'none',
  isMutual: false,
  isBlocked: false,
  hasSharedChallengeEligibility: false,
};

describe('resolveLayer', () => {
  it('본인 피드는 항상 L4', () => {
    expect(resolveLayer({ ...base, isOwn: true, isBlocked: true })).toBe(4);
  });

  it('차단된 요청자는 -1', () => {
    expect(resolveLayer({ ...base, isBlocked: true })).toBe(-1);
  });

  it('맞팔이면 L4', () => {
    expect(resolveLayer({ ...base, followStatus: 'accepted', isMutual: true })).toBe(4);
  });

  it('팔로우 수락 + tab02Public이면 L4', () => {
    expect(resolveLayer({ ...base, followStatus: 'accepted', tab02Public: true })).toBe(4);
  });

  it('단방향 팔로우 수락은 L3', () => {
    expect(resolveLayer({ ...base, followStatus: 'accepted' })).toBe(3);
  });

  it('공통 챌린지 완주 조건 충족 시 L2 (공개 여부보다 우선)', () => {
    expect(
      resolveLayer({ ...base, hasSharedChallengeEligibility: true, isPublic: true }),
    ).toBe(2);
  });

  it('공개 피드는 L1', () => {
    expect(resolveLayer({ ...base, isPublic: true })).toBe(1);
  });

  it('기본은 L0 (pending 포함)', () => {
    expect(resolveLayer(base)).toBe(0);
    expect(resolveLayer({ ...base, followStatus: 'pending' })).toBe(0);
  });
});

describe('visibilityAccessible', () => {
  it('private/mutual은 L4 이상', () => {
    expect(visibilityAccessible('private', 3)).toBe(false);
    expect(visibilityAccessible('private', 4)).toBe(true);
    expect(visibilityAccessible('mutual', 3)).toBe(false);
    expect(visibilityAccessible('mutual', 4)).toBe(true);
  });

  it('followers는 L3 이상', () => {
    expect(visibilityAccessible('followers', 2)).toBe(false);
    expect(visibilityAccessible('followers', 3)).toBe(true);
  });

  it('알 수 없는 visibility는 접근 불가', () => {
    expect(visibilityAccessible('public', 4)).toBe(false);
  });
});

describe('layerForPosts', () => {
  it('본인 4 / 맞팔 4 / 단방향 3 / 그 외 0', () => {
    expect(layerForPosts(true, false, false)).toBe(4);
    expect(layerForPosts(false, true, true)).toBe(4);
    expect(layerForPosts(false, true, false)).toBe(3);
    expect(layerForPosts(false, false, true)).toBe(0);
    expect(layerForPosts(false, false, false)).toBe(0);
  });
});

describe('followId', () => {
  it('생성/파싱 왕복', () => {
    const id = makeFollowId('user-a', 'user-b');
    expect(id).toBe('user-a#user-b');
    expect(parseFollowId(id)).toEqual({ followerId: 'user-a', followeeId: 'user-b' });
  });

  it('구분자 없거나 빈 조각이면 null', () => {
    expect(parseFollowId('no-separator')).toBeNull();
    expect(parseFollowId('#b')).toBeNull();
    expect(parseFollowId('a#')).toBeNull();
  });
});

describe('deriveFollowStatus', () => {
  it('FOLLOWER 아이템 존재 → accepted, FOLLOWREQ → pending, 없으면 none', () => {
    expect(deriveFollowStatus(true, false)).toBe('accepted');
    expect(deriveFollowStatus(true, true)).toBe('accepted');
    expect(deriveFollowStatus(false, true)).toBe('pending');
    expect(deriveFollowStatus(false, false)).toBe('none');
  });
});
