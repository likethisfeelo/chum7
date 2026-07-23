/**
 * 친구 관계 + 추천 라우트 (/u/friends) — P2 단계 B.
 * 추천은 interaction-projector가 적재한 사용자쌍 집계(gsi1 REC#)에서 상위 N.
 * 추천 사유는 비식별(집계 숫자만) — 어떤 익명 활동이 누구였는지 절대 노출하지 않는다.
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import {
  deleteFriendEdge,
  getFriendEdge,
  getPairStat,
  listFriendEdges,
  listRecommendationStats,
  putFriendEdge,
  setPairFriendFlag,
} from '../repo/friends-repo';
import { getProfileItem } from '../repo/profile-repo';

export const friendsRoutes = new Hono<AppEnv>();

async function displayNameOf(userId: string): Promise<string> {
  const p = await getProfileItem(userId);
  return (p?.name as string) || '이웃';
}

/** 집계 → 비식별 상호작용 강도 */
function interactionLevel(stat: Record<string, any>): 'frequent' | 'regular' | 'occasional' {
  const score = Number(stat.recommendationScore ?? 0);
  if (score >= 12) return 'frequent';
  if (score >= 6) return 'regular';
  return 'occasional';
}

// 추천 목록 — 이미 관계(친구/요청/차단)인 상대는 제외
friendsRoutes.get('/recommendations', async (c) => {
  const { userId } = c.get('authUser')!;
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 50);

  const stats = await listRecommendationStats(userId, limit * 2);
  const edges = await listFriendEdges(userId);
  const related = new Set(edges.map((e) => String(e.otherUserId)));

  const candidates = stats.filter((s) => s.otherUserId && !related.has(String(s.otherUserId))).slice(0, limit);
  const recommendations = await Promise.all(
    candidates.map(async (s) => ({
      user: { userId: s.otherUserId, displayName: await displayNameOf(String(s.otherUserId)) },
      reason: {
        sharedChallenges: Number(s.sharedChallengeCount ?? 0),
        interactionLevel: interactionLevel(s),
      },
    })),
  );
  return ok(c, { recommendations, total: recommendations.length });
});

// 친구 요청 — 양쪽에 pending 엣지(방향 표기)
friendsRoutes.post('/requests', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = (await c.req.json().catch(() => ({}))) as { toUserId?: string };
  const toUserId = body.toUserId;
  if (!toUserId) return fail(c, 400, 'MISSING_TARGET', 'toUserId가 필요합니다');
  if (toUserId === userId) return fail(c, 400, 'SELF_REQUEST', '자기 자신에게는 요청할 수 없습니다');

  const existing = await getFriendEdge(userId, toUserId);
  if (existing?.status === 'accepted') return fail(c, 409, 'ALREADY_FRIENDS', '이미 친구입니다');
  if (existing?.status === 'blocked') return fail(c, 409, 'BLOCKED', '차단된 관계입니다');

  const now = new Date().toISOString();
  await putFriendEdge({ userId, otherUserId: toUserId, status: 'pending', direction: 'outgoing', requestedAt: now });
  await putFriendEdge({ userId: toUserId, otherUserId: userId, status: 'pending', direction: 'incoming', requestedAt: now });
  return ok(c, { requested: true, toUserId }, '친구 요청을 보냈습니다');
});

// 수락 — 양쪽 accepted + 집계 isFriend=true (추천에서 제외)
friendsRoutes.post('/requests/:fromUserId/accept', async (c) => {
  const { userId } = c.get('authUser')!;
  const fromUserId = c.req.param('fromUserId');

  const incoming = await getFriendEdge(userId, fromUserId);
  if (!incoming || incoming.status !== 'pending' || incoming.direction !== 'incoming') {
    return fail(c, 404, 'NO_PENDING_REQUEST', '수락할 요청이 없습니다');
  }

  const now = new Date().toISOString();
  await putFriendEdge({ userId, otherUserId: fromUserId, status: 'accepted', direction: 'mutual', acceptedAt: now });
  await putFriendEdge({ userId: fromUserId, otherUserId: userId, status: 'accepted', direction: 'mutual', acceptedAt: now });
  await setPairFriendFlag(userId, fromUserId, true);
  await setPairFriendFlag(fromUserId, userId, true);
  return ok(c, { accepted: true, friendUserId: fromUserId }, '친구가 되었습니다');
});

// 차단 — 양쪽 blocked (추천/요청 대상에서 제외)
friendsRoutes.post('/:otherUserId/block', async (c) => {
  const { userId } = c.get('authUser')!;
  const otherUserId = c.req.param('otherUserId');
  await putFriendEdge({ userId, otherUserId, status: 'blocked', direction: 'outgoing' });
  await putFriendEdge({ userId: otherUserId, otherUserId: userId, status: 'blocked', direction: 'incoming' });
  return ok(c, { blocked: true, otherUserId });
});

// 친구/요청 삭제(해제·요청 취소)
friendsRoutes.delete('/:otherUserId', async (c) => {
  const { userId } = c.get('authUser')!;
  const otherUserId = c.req.param('otherUserId');
  await deleteFriendEdge(userId, otherUserId);
  await deleteFriendEdge(otherUserId, userId);
  await setPairFriendFlag(userId, otherUserId, false);
  await setPairFriendFlag(otherUserId, userId, false);
  return ok(c, { removed: true, otherUserId });
});

// 내 친구 목록 (accepted)
friendsRoutes.get('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const edges = (await listFriendEdges(userId)).filter((e) => e.status === 'accepted');
  const friends = await Promise.all(
    edges.map(async (e) => ({
      userId: e.otherUserId,
      displayName: await displayNameOf(String(e.otherUserId)),
      since: e.acceptedAt ?? null,
    })),
  );
  return ok(c, { friends, total: friends.length });
});

// 받은 친구 요청 (incoming pending)
friendsRoutes.get('/requests', async (c) => {
  const { userId } = c.get('authUser')!;
  const edges = (await listFriendEdges(userId)).filter(
    (e) => e.status === 'pending' && e.direction === 'incoming',
  );
  const requests = await Promise.all(
    edges.map(async (e) => ({
      fromUserId: e.otherUserId,
      displayName: await displayNameOf(String(e.otherUserId)),
      requestedAt: e.requestedAt ?? null,
    })),
  );
  return ok(c, { requests, total: requests.length });
});
