import {
  BUNDLE_WINDOW_MINUTES,
  MAX_PUSHES_PER_WINDOW,
  bundleTag,
  bundledBody,
  decideBundle,
  isPushRateLimited,
  isWithinBundleWindow,
  type RecentNotificationItem,
} from './bundle-rules';

const NOW = new Date('2026-07-21T12:00:00.000Z');

/** now 기준 minutesAgo 분 전에 생성된 미읽음 알림 아이템 */
function recentItem(
  minutesAgo: number,
  overrides: Partial<RecentNotificationItem> = {},
): RecentNotificationItem {
  return {
    category: 'social',
    eventType: 'comment.created',
    isRead: false,
    createdAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    detail: { targetId: 'post-1' },
    ...overrides,
  };
}

describe('isWithinBundleWindow (윈도우 경계)', () => {
  it('30분 정각까지 포함, 그 이후는 제외', () => {
    const exactly = new Date(NOW.getTime() - BUNDLE_WINDOW_MINUTES * 60_000).toISOString();
    const justOver = new Date(NOW.getTime() - BUNDLE_WINDOW_MINUTES * 60_000 - 1).toISOString();
    expect(isWithinBundleWindow(exactly, NOW)).toBe(true);
    expect(isWithinBundleWindow(justOver, NOW)).toBe(false);
  });

  it('형식이 틀리거나 없는 createdAt 은 제외', () => {
    expect(isWithinBundleWindow(undefined, NOW)).toBe(false);
    expect(isWithinBundleWindow('not-a-date', NOW)).toBe(false);
  });
});

describe('bundleTag', () => {
  it('<category>:<targetId||general> 형식의 안정 태그', () => {
    expect(bundleTag('social', { targetId: 'post-1' })).toBe('social:post-1');
    expect(bundleTag('social', {})).toBe('social:general');
    expect(bundleTag('cheer', undefined)).toBe('cheer:general');
  });
});

describe('decideBundle — 동일 대상 묶음', () => {
  it('같은 게시물 comment.created 2건 → 집계 문구', () => {
    const result = decideBundle({
      category: 'social',
      eventType: 'comment.created',
      message: '내 게시물에 새 댓글이 달렸어요',
      detail: { targetId: 'post-1' },
      recent: [recentItem(5)],
      now: NOW,
    });
    expect(result).toEqual({
      body: '내 게시물에 새 댓글이 2건 달렸어요',
      bundled: true,
      count: 2,
      tag: 'social:post-1',
      renotify: false,
    });
  });

  it('다른 게시물의 댓글은 묶지 않는다', () => {
    const result = decideBundle({
      category: 'social',
      eventType: 'comment.created',
      message: '내 게시물에 새 댓글이 달렸어요',
      detail: { targetId: 'post-1' },
      recent: [recentItem(5, { detail: { targetId: 'post-2' } })],
      now: NOW,
    });
    expect(result.bundled).toBe(false);
    expect(result.body).toBe('내 게시물에 새 댓글이 달렸어요');
    expect(result.tag).toBe('social:post-1');
  });

  it('읽은 알림·윈도우 밖 알림·다른 이벤트 유형은 제외', () => {
    const result = decideBundle({
      category: 'social',
      eventType: 'comment.created',
      message: '내 게시물에 새 댓글이 달렸어요',
      detail: { targetId: 'post-1' },
      recent: [
        recentItem(5, { isRead: true }),
        recentItem(BUNDLE_WINDOW_MINUTES + 1),
        recentItem(5, { eventType: 'follow.requested', detail: {} }),
      ],
      now: NOW,
    });
    expect(result.bundled).toBe(false);
  });
});

describe('decideBundle — 카테고리별 문구', () => {
  it('follow.requested → 새 팔로우 요청이 N건 있어요 (targetId 없음 → general 태그)', () => {
    const result = decideBundle({
      category: 'social',
      eventType: 'follow.requested',
      message: '새 팔로우 요청이 있어요',
      detail: {},
      recent: [
        recentItem(3, { eventType: 'follow.requested', detail: {} }),
        recentItem(10, { eventType: 'follow.requested', detail: {} }),
      ],
      now: NOW,
    });
    expect(result.body).toBe('새 팔로우 요청이 3건 있어요');
    expect(result.tag).toBe('social:general');
  });

  it('리액션 + 보낸 사람 이름 있음 → OO 외 N명이 반응했어요', () => {
    const result = decideBundle({
      category: 'social',
      eventType: 'reaction.created',
      message: '내 게시물에 반응이 달렸어요',
      detail: { targetId: 'post-1', senderName: '철수' },
      recent: [
        recentItem(2, { eventType: 'reaction.created' }),
        recentItem(4, { eventType: 'reaction.created' }),
        recentItem(6, { eventType: 'reaction.created' }),
      ],
      now: NOW,
    });
    expect(result.body).toBe('철수 외 3명이 반응했어요');
    expect(result.count).toBe(4);
  });

  it('리액션 + 이름 없음 → 건수 기반 문구', () => {
    const result = decideBundle({
      category: 'social',
      eventType: 'reaction.created',
      message: '내 게시물에 반응이 달렸어요',
      detail: { targetId: 'post-1' },
      recent: [recentItem(2, { eventType: 'reaction.created' })],
      now: NOW,
    });
    expect(result.body).toBe('내 게시물에 반응이 2건 달렸어요');
  });

  it('새 알림에 이름이 없으면 최근 알림 detail 에서 이름을 찾는다', () => {
    const result = decideBundle({
      category: 'social',
      eventType: 'reaction.created',
      message: '내 게시물에 반응이 달렸어요',
      detail: { targetId: 'post-1' },
      recent: [
        recentItem(2, { eventType: 'reaction.created', detail: { targetId: 'post-1', senderName: '영희' } }),
      ],
      now: NOW,
    });
    expect(result.body).toBe('영희 외 1명이 반응했어요');
  });

  it('전용 문구가 없는 이벤트 유형은 일반 집계 문구', () => {
    expect(bundledBody({ eventType: 'follow.accepted', count: 2 })).toBe('새 알림이 2건 있어요');
    expect(bundledBody({ eventType: 'feed.invite_link_used', count: 2 })).toBe(
      '초대 링크로 새 이웃이 2명 들어왔어요',
    );
  });
});

describe('decideBundle — cheer 미묶음', () => {
  it('응원은 최근 알림이 아무리 많아도 단건 발송', () => {
    const cheers = [0, 1, 2, 3].map((m) =>
      recentItem(m, { category: 'cheer', eventType: 'cheer.delivered', detail: {} }),
    );
    const result = decideBundle({
      category: 'cheer',
      eventType: 'cheer.delivered',
      message: '응원이 도착했어요! 오늘의 실천을 시작해보세요 🎉',
      detail: {},
      recent: cheers,
      now: NOW,
    });
    expect(result).toEqual({
      body: '응원이 도착했어요! 오늘의 실천을 시작해보세요 🎉',
      bundled: false,
      count: 1,
      tag: 'cheer:general',
    });
  });
});

describe('isPushRateLimited — 폭주 가드', () => {
  it('윈도우 내 5건 이상이면 비-cheer 푸시 억제', () => {
    const five = [1, 2, 3, 4, 5].map((m) => recentItem(m));
    expect(five).toHaveLength(MAX_PUSHES_PER_WINDOW);
    expect(isPushRateLimited({ category: 'social', recent: five, now: NOW })).toBe(true);
  });

  it('윈도우 내 4건이면 허용', () => {
    const four = [1, 2, 3, 4].map((m) => recentItem(m));
    expect(isPushRateLimited({ category: 'social', recent: four, now: NOW })).toBe(false);
  });

  it('윈도우 밖 알림은 세지 않는다', () => {
    const stale = [40, 50, 60, 70, 80].map((m) => recentItem(m));
    expect(isPushRateLimited({ category: 'social', recent: stale, now: NOW })).toBe(false);
  });

  it('cheer 는 폭주 상황에도 억제하지 않는다', () => {
    const many = [1, 2, 3, 4, 5, 6].map((m) => recentItem(m));
    expect(isPushRateLimited({ category: 'cheer', recent: many, now: NOW })).toBe(false);
  });
});
