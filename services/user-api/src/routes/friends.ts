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
  getLedgerItem,
  getPairStat,
  listFriendEdges,
  listPairLedger,
  listRecommendationStats,
  putFriendEdge,
  setArchiveConsent,
  setPairFriendFlag,
} from '../repo/friends-repo';
import { getProfileItem } from '../repo/profile-repo';

export const friendsRoutes = new Hono<AppEnv>();

/** 쌍 키 정규화 (원장 파티션) */
function pairOrder(a: string, b: string): { lo: string; hi: string } {
  return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
}

/** 두 사람이 수락된 친구이고 차단이 아닌지 — 아니면 null */
async function friendshipOf(me: string, other: string) {
  const mine = await getFriendEdge(me, other);
  const theirs = await getFriendEdge(other, me);
  if (mine?.status !== 'accepted' || theirs?.status !== 'accepted') return null;
  return { mine, theirs };
}

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

// ── 관계 아카이브 (P3) ──────────────────────────────────────────────

// 단계 C: 관계 요약 — 친구면 자동 공개 (집계 숫자만)
friendsRoutes.get('/:otherUserId/relationship-summary', async (c) => {
  const { userId } = c.get('authUser')!;
  const otherUserId = c.req.param('otherUserId');
  if (!(await friendshipOf(userId, otherUserId))) {
    return fail(c, 403, 'NOT_FRIENDS', '친구 사이에서만 볼 수 있어요');
  }
  const stat = (await getPairStat(userId, otherUserId)) ?? {};
  return ok(c, {
    sharedChallengeCount: Number(stat.sharedChallengeCount ?? 0),
    commentCount: Number(stat.commentCount ?? 0) + Number(stat.replyCount ?? 0),
    reactionCount: Number(stat.reactionCount ?? 0),
    cheerCount: Number(stat.cheerCount ?? 0),
    plazaMeetCount: Number(stat.plazaMeetCount ?? 0),
    firstInteractionAt: stat.firstInteractionAt ?? null,
    lastInteractionAt: stat.lastInteractionAt ?? null,
  });
});

// 아카이브 동의 설정 (내 쪽 — 타임라인/전체는 양쪽 동의 AND)
friendsRoutes.post('/:otherUserId/archive-consent', async (c) => {
  const { userId } = c.get('authUser')!;
  const otherUserId = c.req.param('otherUserId');
  if (!(await friendshipOf(userId, otherUserId))) {
    return fail(c, 403, 'NOT_FRIENDS', '친구 사이에서만 설정할 수 있어요');
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    timeline?: boolean;
    fullContent?: boolean;
  };
  await setArchiveConsent(userId, otherUserId, {
    timelineConsent: body.timeline,
    fullContentConsent: body.fullContent,
  });
  return ok(c, { updated: true });
});

// 단계 D: 관계 타임라인 — 양쪽 timeline 동의 필요
friendsRoutes.get('/:otherUserId/archive', async (c) => {
  const { userId } = c.get('authUser')!;
  const otherUserId = c.req.param('otherUserId');
  const fs = await friendshipOf(userId, otherUserId);
  if (!fs) return fail(c, 403, 'NOT_FRIENDS', '친구 사이에서만 볼 수 있어요');
  if (fs.mine.timelineConsent !== true || fs.theirs.timelineConsent !== true) {
    return fail(c, 403, 'TIMELINE_CONSENT_REQUIRED', '양쪽이 타임라인 공개에 동의해야 볼 수 있어요');
  }

  const { lo, hi } = pairOrder(userId, otherUserId);
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 30), 1), 100);
  const { items, lastKey } = await listPairLedger(lo, hi, limit);
  const timeline = items
    .filter((it) => it.visibilityState !== 'deleted' && it.visibilityState !== 'hidden')
    .map((it) => ({
      interactionId: it.interactionId,
      occurredAt: it.occurredAt,
      interactionType: it.interactionType,
      contextType: it.contextType,
      contextId: it.contextId ?? null,
      // 당사자 표기는 나/친구 + 작성 당시 활동명 스냅샷(있으면). 실명 재작성 금지.
      actorIsMine: it.actorUserId === userId,
      actorDisplayName: it.actorDisplayName ?? null,
      hasSource: Boolean(it.sourceEntityId),
    }));
  return ok(c, {
    timeline,
    nextCursor: lastKey
      ? Buffer.from(JSON.stringify(lastKey)).toString('base64')
      : null,
  });
});

// 단계 E: 실콘텐츠 참조 — 양쪽 전체 동의 + 글로벌 플래그. 원본 링크 참조를 돌려준다
// (크로스 도메인 원문 조회 대신 컨텍스트 id를 제공 → 프론트가 기존 화면으로 딥링크).
friendsRoutes.get('/:otherUserId/archive/:interactionId', async (c) => {
  const { userId } = c.get('authUser')!;
  const otherUserId = c.req.param('otherUserId');
  const interactionId = c.req.param('interactionId');
  const occurredAt = c.req.query('occurredAt');
  if (!occurredAt) return fail(c, 400, 'MISSING_OCCURRED_AT', 'occurredAt 쿼리가 필요합니다');

  const fs = await friendshipOf(userId, otherUserId);
  if (!fs) return fail(c, 403, 'NOT_FRIENDS', '친구 사이에서만 볼 수 있어요');
  if (process.env.ARCHIVE_FULL_CONTENT_ENABLED !== 'true') {
    return fail(c, 403, 'FEATURE_DISABLED', '전체 아카이브는 아직 제공되지 않아요');
  }
  if (fs.mine.fullContentConsent !== true || fs.theirs.fullContentConsent !== true) {
    return fail(c, 403, 'FULL_CONTENT_CONSENT_REQUIRED', '양쪽이 전체 공개에 동의해야 볼 수 있어요');
  }

  const { lo, hi } = pairOrder(userId, otherUserId);
  const item = await getLedgerItem(lo, hi, occurredAt, interactionId);
  if (!item || item.visibilityState === 'deleted' || item.visibilityState === 'hidden') {
    return fail(c, 404, 'CONTENT_UNAVAILABLE', '원본을 볼 수 없어요(삭제·비공개)');
  }
  // 감사 로그 (전체 아카이브 조회) — CloudWatch 구조화 로그
  console.log(
    JSON.stringify({
      level: 'audit',
      action: 'archive_item_viewed',
      viewerUserId: userId,
      counterpartUserId: otherUserId,
      interactionId,
      sourceEntityId: item.sourceEntityId ?? null,
      at: new Date().toISOString(),
    }),
  );
  return ok(c, {
    interactionType: item.interactionType,
    contextType: item.contextType,
    contextId: item.contextId ?? null,
    sourceEntityType: item.sourceEntityType ?? null,
    sourceEntityId: item.sourceEntityId ?? null,
    sourcePostId: item.sourcePostId ?? null,
    occurredAt: item.occurredAt,
  });
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
