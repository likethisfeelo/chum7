/**
 * 친구·아카이브 라우트 통합테스트 — repo/이벤트를 목킹하고 Hono 앱으로 실제 HTTP를 태운다.
 * 순수 도메인 테스트(friend-eligibility.test.ts)가 못 잡는 라우트 오케스트레이션
 * (자격 게이트·상호신청 부수효과·동의 게이트·에러 코드·커서)을 검증한다.
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';

jest.mock('../repo/friends-repo');
jest.mock('../repo/profile-repo');
jest.mock('@chum7/api-kit', () => {
  const actual = jest.requireActual('@chum7/api-kit');
  return { ...actual, publishEvent: jest.fn().mockResolvedValue(undefined) };
});

import * as repo from '../repo/friends-repo';
import * as profileRepo from '../repo/profile-repo';
import { publishEvent } from '@chum7/api-kit';
import { friendsRoutes } from './friends';

const r = repo as jest.Mocked<typeof repo>;
const pr = profileRepo as jest.Mocked<typeof profileRepo>;
const publish = publishEvent as jest.Mock;

function makeApp(userId = 'me') {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('authUser', { userId, groups: [] });
    await next();
  });
  app.route('/u/friends', friendsRoutes);
  return app;
}

const acceptedEdge = (over: Record<string, unknown> = {}) => ({ status: 'accepted', ...over });
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FRIENDS_ENABLED = 'true';
  process.env.FRIEND_ELIGIBILITY_THRESHOLD = '100';
  delete process.env.ARCHIVE_FULL_CONTENT_ENABLED;
  pr.getProfileItem.mockResolvedValue({ name: '이웃님' } as any);
});

describe('GET /candidates', () => {
  it('FRIENDS_ENABLED=false면 항상 빈 후보', async () => {
    process.env.FRIENDS_ENABLED = 'false';
    const res = await makeApp().request('/u/friends/candidates');
    expect(res.status).toBe(200);
    expect((await readJson(res)).data).toEqual({ candidates: [], total: 0 });
    expect(r.listPairStatsForUser).not.toHaveBeenCalled();
  });

  it('자격 충족 + 미관계만 후보로, 이미 관계된 상대는 제외', async () => {
    r.listPairStatsForUser.mockResolvedValue([
      { otherUserId: 'a', outCount: 120, inCount: 130, sharedChallengeCount: 2 }, // 자격 O
      { otherUserId: 'b', outCount: 120, inCount: 10 }, // 단방향 → 자격 X
      { otherUserId: 'c', outCount: 200, inCount: 200 }, // 자격 O지만 이미 친구
    ]);
    r.listFriendEdges.mockResolvedValue([{ otherUserId: 'c', status: 'accepted' }]);

    const res = await makeApp().request('/u/friends/candidates');
    const { data } = await readJson(res);
    expect(data.total).toBe(1);
    expect(data.candidates[0].user.userId).toBe('a');
    expect(data.candidates[0].reason.sharedChallenges).toBe(2);
  });
});

describe('POST /requests', () => {
  const post = (app: Hono<AppEnv>, body: unknown) =>
    app.request('/u/friends/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('기능 비활성 → 403', async () => {
    process.env.FRIENDS_ENABLED = 'false';
    const res = await post(makeApp(), { toUserId: 'x' });
    expect(res.status).toBe(403);
  });

  it('대상 없음 → 400, 자기 자신 → 400', async () => {
    expect((await post(makeApp(), {})).status).toBe(400);
    expect((await post(makeApp('me'), { toUserId: 'me' })).status).toBe(400);
  });

  it('자격 미달 → 403 NOT_ELIGIBLE', async () => {
    r.getFriendEdge.mockResolvedValue(undefined as any);
    r.getPairStat.mockResolvedValue({ outCount: 100, inCount: 5 } as any);
    const res = await post(makeApp(), { toUserId: 'x' });
    expect(res.status).toBe(403);
    expect((await readJson(res)).error).toBe('NOT_ELIGIBLE');
  });

  it('최초 신청 → 양쪽 pending + friend.requested 발행', async () => {
    r.getFriendEdge.mockResolvedValue(undefined as any);
    r.getPairStat.mockResolvedValue({ outCount: 100, inCount: 100 } as any);
    const res = await post(makeApp('me'), { toUserId: 'x' });
    expect(res.status).toBe(200);
    expect((await readJson(res)).data).toMatchObject({ requested: true, toUserId: 'x' });
    expect(r.putFriendEdge).toHaveBeenCalledTimes(2);
    expect(r.putFriendEdge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', otherUserId: 'x', status: 'pending', direction: 'outgoing' }),
    );
    expect(publish).toHaveBeenCalledWith('friend.requested', { requesterId: 'me', targetUserId: 'x' });
  });

  it('상대가 이미 신청(incoming pending) → 자동 친구 + friend.accepted + 플래그 세팅', async () => {
    r.getFriendEdge.mockResolvedValue({ status: 'pending', direction: 'incoming' } as any);
    r.getPairStat.mockResolvedValue({ outCount: 100, inCount: 100 } as any);
    const res = await post(makeApp('me'), { toUserId: 'x' });
    expect(res.status).toBe(200);
    expect((await readJson(res)).data).toMatchObject({ friend: true, friendUserId: 'x' });
    // 양쪽 accepted 엣지 + 양쪽 친구 플래그
    expect(r.putFriendEdge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', otherUserId: 'x', status: 'accepted', direction: 'mutual' }),
    );
    expect(r.setPairFriendFlag).toHaveBeenCalledWith('me', 'x', true);
    expect(r.setPairFriendFlag).toHaveBeenCalledWith('x', 'me', true);
    expect(publish).toHaveBeenCalledWith('friend.accepted', { accepterId: 'me', requesterId: 'x' });
  });

  it('이미 친구 → 409, 차단 → 409 (자격 조회 전 단락)', async () => {
    r.getPairStat.mockResolvedValue(null as any);
    r.getFriendEdge.mockResolvedValue({ status: 'accepted' } as any);
    expect((await post(makeApp(), { toUserId: 'x' })).status).toBe(409);
    r.getFriendEdge.mockResolvedValue({ status: 'blocked' } as any);
    expect((await post(makeApp(), { toUserId: 'x' })).status).toBe(409);
  });
});

describe('POST /:id/block & DELETE /:id', () => {
  it('차단 시 양쪽 blocked + 친구 플래그 해제', async () => {
    const res = await makeApp('me').request('/u/friends/x/block', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(r.putFriendEdge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', otherUserId: 'x', status: 'blocked' }),
    );
    expect(r.setPairFriendFlag).toHaveBeenCalledWith('me', 'x', false);
    expect(r.setPairFriendFlag).toHaveBeenCalledWith('x', 'me', false);
  });

  it('삭제 시 양쪽 엣지 제거 + 플래그 해제', async () => {
    const res = await makeApp('me').request('/u/friends/x', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(r.deleteFriendEdge).toHaveBeenCalledWith('me', 'x');
    expect(r.deleteFriendEdge).toHaveBeenCalledWith('x', 'me');
    expect(r.setPairFriendFlag).toHaveBeenCalledWith('me', 'x', false);
  });
});

describe('GET /:id/relationship-summary', () => {
  it('친구 아니면 403', async () => {
    r.getFriendEdge.mockResolvedValue({ status: 'pending' } as any);
    const res = await makeApp().request('/u/friends/x/relationship-summary');
    expect(res.status).toBe(403);
  });

  it('친구면 집계 숫자 + 양쪽 동의 상태 반환', async () => {
    r.getFriendEdge
      .mockResolvedValueOnce(acceptedEdge({ timelineConsent: true }) as any) // mine
      .mockResolvedValueOnce(acceptedEdge({ timelineConsent: false }) as any); // theirs
    r.getPairStat.mockResolvedValue({
      sharedChallengeCount: 3,
      commentCount: 4,
      replyCount: 1,
      reactionCount: 2,
    } as any);
    const res = await makeApp().request('/u/friends/x/relationship-summary');
    const { data } = await readJson(res);
    expect(data.sharedChallengeCount).toBe(3);
    expect(data.commentCount).toBe(5); // comment + reply
    expect(data.myConsent.timeline).toBe(true);
    expect(data.counterpartConsent.timeline).toBe(false);
  });
});

describe('GET /:id/archive', () => {
  it('양쪽 timeline 동의 없으면 403 TIMELINE_CONSENT_REQUIRED', async () => {
    r.getFriendEdge
      .mockResolvedValueOnce(acceptedEdge({ timelineConsent: true }) as any)
      .mockResolvedValueOnce(acceptedEdge({ timelineConsent: false }) as any);
    const res = await makeApp().request('/u/friends/x/archive');
    expect(res.status).toBe(403);
    expect((await readJson(res)).error).toBe('TIMELINE_CONSENT_REQUIRED');
  });

  it('양쪽 동의 시 삭제/숨김 제외한 타임라인 + nextCursor', async () => {
    r.getFriendEdge
      .mockResolvedValueOnce(acceptedEdge({ timelineConsent: true }) as any)
      .mockResolvedValueOnce(acceptedEdge({ timelineConsent: true }) as any);
    r.listPairLedger.mockResolvedValue({
      items: [
        { interactionId: 'i1', occurredAt: '2026-01-01', interactionType: 'comment', contextType: 'plaza', actorUserId: 'me' },
        { interactionId: 'i2', occurredAt: '2026-01-02', interactionType: 'reaction', contextType: 'board', actorUserId: 'x', visibilityState: 'deleted' },
      ],
      lastKey: { pk: 'PAIR#a#b', sk: 'EVT#z' },
    } as any);
    const res = await makeApp('me').request('/u/friends/x/archive');
    const { data } = await readJson(res);
    expect(data.timeline).toHaveLength(1); // deleted 제외
    expect(data.timeline[0]).toMatchObject({ interactionId: 'i1', actorIsMine: true });
    expect(typeof data.nextCursor).toBe('string');
  });

  it('잘못된 커서 → 400 INVALID_CURSOR', async () => {
    r.getFriendEdge
      .mockResolvedValueOnce(acceptedEdge({ timelineConsent: true }) as any)
      .mockResolvedValueOnce(acceptedEdge({ timelineConsent: true }) as any);
    const res = await makeApp().request('/u/friends/x/archive?cursor=%ff%ff-not-base64-json');
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe('INVALID_CURSOR');
  });
});

describe('GET /:id/archive/:iid (단계 E)', () => {
  it('occurredAt 없으면 400', async () => {
    const res = await makeApp().request('/u/friends/x/archive/i1');
    expect(res.status).toBe(400);
  });

  it('글로벌 플래그 off면 403 FEATURE_DISABLED', async () => {
    r.getFriendEdge.mockResolvedValue(acceptedEdge({ fullContentConsent: true }) as any);
    const res = await makeApp().request('/u/friends/x/archive/i1?occurredAt=2026-01-01');
    expect(res.status).toBe(403);
    expect((await readJson(res)).error).toBe('FEATURE_DISABLED');
  });
});
