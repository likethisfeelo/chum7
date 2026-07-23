import { Hono } from 'hono';
import { AppEnv, ApiContext, fail, ok, publishEvent } from '@chum7/api-kit';
import {
  deriveFollowStatus,
  makeFollowId,
  parseFollowId,
  resolveLayer,
  FollowStatus,
} from '../domain/feed-visibility';
import { isValidHandle, nextHandleChangeAt, normalizeHandle } from '../domain/handle';
import { getFriendEdge } from '../repo/friends-repo';
import {
  deleteBlock,
  deleteFollow,
  deleteFollowRequest,
  getFollow,
  getFollowRequest,
  isBlocked,
  listBlocked,
  listFollowRequests,
  listFollowers,
  putBlockIfAbsent,
  putFollow,
  putFollowRequest,
} from '../repo/graph-repo';
import {
  getProfileItem,
  getProfileItemByHandle,
  setFeedHandle,
  setFeedSettings,
} from '../repo/profile-repo';

/**
 * /u/feed — 개인 피드: 프로필/레이어·팔로우·차단·핸들·공개 설정.
 * 레거시 backend/services/personal-feed/{profile,follow,block,handle,settings} 계약 승계.
 * 자유글·저장 게시물·초대 링크는 personal-feed-content.ts (400줄 제한 분할).
 */
export const personalFeedRoutes = new Hono<AppEnv>();

const byCreatedAtDesc = (a: { createdAt?: string }, b: { createdAt?: string }) =>
  (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

async function followStatusOf(followeeId: string, followerId: string): Promise<FollowStatus> {
  const [follow, request] = await Promise.all([
    getFollow(followeeId, followerId),
    getFollowRequest(followeeId, followerId),
  ]);
  return deriveFollowStatus(!!follow, !!request);
}

/** 프로필 + 레이어 판정 공통 코어 (보호 라우트·퍼블릭 라우트 공용) */
async function feedProfileResponse(c: ApiContext, requesterId: string | null, rawParam: string) {
  // @handle 형식이면 users gsi1(HANDLE#<handle>) 로 조회
  let user: Record<string, unknown> | undefined;
  let targetUserId: string;
  if (rawParam.startsWith('@')) {
    const handle = rawParam.slice(1).toLowerCase();
    user = await getProfileItemByHandle(handle);
    if (!user) {
      return c.json({ error: 'HANDLE_NOT_FOUND', message: '핸들을 찾을 수 없습니다' }, 404);
    }
    targetUserId = user.userId as string;
  } else {
    targetUserId = rawParam;
    user = await getProfileItem(targetUserId);
    if (!user) {
      return c.json({ error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' }, 404);
    }
  }

  const isOwn = requesterId !== null && targetUserId === requesterId;
  const feedSettings = (user.feedSettings as Record<string, unknown>) ?? {};
  const isPublic = Boolean(feedSettings.isPublic);
  const tab02Public = Boolean(feedSettings.tab02Public);

  // 타인 피드 접근 시에만 팔로우/차단 상태 조회
  let followStatus: FollowStatus = 'none';
  let reverseFollowStatus: FollowStatus = 'none';
  let blockedByTarget = false;
  let isFriend = false;
  if (requesterId && !isOwn) {
    const [fs, rfs, blk, friendEdge] = await Promise.all([
      followStatusOf(targetUserId, requesterId),
      followStatusOf(requesterId, targetUserId),
      isBlocked(targetUserId, requesterId),
      getFriendEdge(requesterId, targetUserId),
    ]);
    followStatus = fs;
    reverseFollowStatus = rfs;
    blockedByTarget = blk;
    isFriend = friendEdge?.status === 'accepted';
  }

  // 친구는 상호 팔로우와 동일한 열람 권한 (친구 모델 v2 §4 — 실명 프로필 피드 상호 열람)
  const isMutual = (followStatus === 'accepted' && reverseFollowStatus === 'accepted') || isFriend;

  const layer = resolveLayer({
    isOwn,
    isPublic,
    tab02Public,
    followStatus,
    isMutual,
    isBlocked: blockedByTarget,
    // 공통 챌린지 10회 완주 조건(경로 B)은 challenge 도메인 데이터 — user-api에서
    // 크로스 도메인 조회 금지로 미이식 (PORTING.md 참고). 항상 미충족 처리.
    hasSharedChallengeEligibility: false,
  });

  if (layer === -1) {
    return c.json({ error: 'BLOCKED' }, 403);
  }

  return ok(c, {
    userId: user.userId,
    feedHandle: (user.feedHandle as string | undefined) ?? null,
    displayName: user.name,
    animalIcon: user.animalIcon ?? '🐰',
    isOwn,
    currentLayer: layer,
    followStatus,
    isMutual,
    isFriend,
    feedSettings: { isPublic, tab02Public },
  });
}

// ── 팔로우 (레거시 personal-feed/follow) ─────────────────────────────────

// GET /u/feed/me/followers — 팔로워 목록
personalFeedRoutes.get('/me/followers', async (c) => {
  const { userId } = c.get('authUser')!;
  const followers = (await listFollowers(userId)).sort(byCreatedAtDesc);
  return ok(c, {
    followers: followers.map((f) => ({
      followId: makeFollowId(f.followerId, userId),
      followerId: f.followerId,
      createdAt: f.createdAt,
    })),
  });
});

// GET /u/feed/me/follow-requests — 수신 팔로우 요청 목록
personalFeedRoutes.get('/me/follow-requests', async (c) => {
  const { userId } = c.get('authUser')!;
  const requests = (await listFollowRequests(userId)).sort(byCreatedAtDesc);
  return ok(c, {
    requests: requests.map((f) => ({
      followId: makeFollowId(f.followerId, userId),
      followerId: f.followerId,
      createdAt: f.createdAt,
    })),
  });
});

// GET /u/feed/me/blocked — 차단 목록 (레거시 personal-feed/block)
personalFeedRoutes.get('/me/blocked', async (c) => {
  const { userId } = c.get('authUser')!;
  const blocked = (await listBlocked(userId)).sort(byCreatedAtDesc);
  return ok(c, {
    blocked: blocked.map((b) => ({
      blockId: `${userId}#${b.blockedUserId}`,
      blockedUserId: b.blockedUserId,
      createdAt: b.createdAt,
    })),
  });
});

// PUT /u/feed/me/handle — 핸들 설정/변경 (레거시 personal-feed/handle)
personalFeedRoutes.put('/me/handle', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = (await c.req.json().catch(() => ({}))) as { handle?: string };
  const handle = normalizeHandle(body.handle ?? '');

  if (!isValidHandle(handle)) {
    return fail(
      c, 400, 'INVALID_HANDLE',
      '핸들은 영문으로 시작하고 영숫자·_만 사용 가능하며 3~20자여야 해요',
    );
  }

  const now = new Date();
  const profile = await getProfileItem(userId);
  const nextAvailable = nextHandleChangeAt(
    profile?.feedHandleUpdatedAt as string | undefined,
    now,
  );
  if (nextAvailable) {
    // 레거시 바디: message + 최상위 nextAvailableAt
    return c.json(
      {
        error: 'CHANGE_LIMIT_EXCEEDED',
        message: `핸들은 30일에 한 번만 변경할 수 있어요. 다음 변경 가능일: ${nextAvailable.toLocaleDateString('ko-KR')}`,
        nextAvailableAt: nextAvailable.toISOString(),
      },
      429,
    );
  }

  const taken = await getProfileItemByHandle(handle);
  if (taken && taken.userId !== userId) {
    return fail(c, 409, 'HANDLE_TAKEN', '이미 사용 중인 핸들이에요');
  }

  const nowIso = now.toISOString();
  await setFeedHandle(userId, handle, nowIso);
  return ok(c, { feedHandle: handle, updatedAt: nowIso });
});

// PUT /u/feed/me/settings — 피드 공개 설정 (레거시 personal-feed/settings)
personalFeedRoutes.put('/me/settings', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = (await c.req.json().catch(() => ({}))) as {
    isPublic?: boolean;
    tab02Public?: boolean;
  };

  if (body.isPublic === undefined && body.tab02Public === undefined) {
    return c.json({ error: 'NO_UPDATES' }, 400);
  }

  const current = ((await getProfileItem(userId))?.feedSettings as Record<string, boolean>) ?? {};
  const newSettings: Record<string, boolean> = {
    isPublic: current.isPublic ?? false,
    tab02Public: current.tab02Public ?? false,
    ...(body.isPublic !== undefined ? { isPublic: Boolean(body.isPublic) } : {}),
    ...(body.tab02Public !== undefined ? { tab02Public: Boolean(body.tab02Public) } : {}),
  };
  await setFeedSettings(userId, newSettings);
  return ok(c, { feedSettings: newSettings });
});

// PUT /u/feed/follow-requests/:followId/accept|reject — 요청 수락/거절
async function resolveFollowRequest(c: ApiContext, action: 'accept' | 'reject') {
  const { userId } = c.get('authUser')!;
  const followIdParam = c.req.param('followId') ?? '';
  const parsed = parseFollowId(followIdParam);
  if (!parsed) return c.json({ error: 'NOT_FOUND' }, 404);

  const { followerId, followeeId } = parsed;
  const request = await getFollowRequest(followeeId, followerId);
  if (!request) {
    // 요청 아이템이 없으면: 이미 수락된 팔로우인지 확인 (레거시 ALREADY_RESOLVED)
    const follow = await getFollow(followeeId, followerId);
    if (follow) {
      if (followeeId !== userId) return c.json({ error: 'FORBIDDEN' }, 403);
      return c.json({ error: 'ALREADY_RESOLVED', status: 'accepted' }, 409);
    }
    return c.json({ error: 'NOT_FOUND' }, 404);
  }
  if (request.followeeId !== userId) return c.json({ error: 'FORBIDDEN' }, 403);

  const nowIso = new Date().toISOString();
  if (action === 'accept') {
    await putFollow(followerId, followeeId, nowIso);
    await publishEvent('follow.accepted', { followerId, followeeId });
  }
  await deleteFollowRequest(followeeId, followerId);

  return ok(c, {
    followId: followIdParam,
    status: action === 'accept' ? 'accepted' : 'rejected',
  });
}
personalFeedRoutes.put('/follow-requests/:followId/accept', (c) => resolveFollowRequest(c, 'accept'));
personalFeedRoutes.put('/follow-requests/:followId/reject', (c) => resolveFollowRequest(c, 'reject'));

// DELETE /u/feed/followers/:followerId — 피드 주인이 팔로워 강제 해제
personalFeedRoutes.delete('/followers/:followerId', async (c) => {
  const { userId } = c.get('authUser')!;
  const followerId = c.req.param('followerId');
  await Promise.all([deleteFollow(userId, followerId), deleteFollowRequest(userId, followerId)]);
  return ok(c);
});

// POST /u/feed/:userId/follow-request — 팔로우 요청
personalFeedRoutes.post('/:userId/follow-request', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const followeeId = c.req.param('userId');
  if (!followeeId || followeeId === me) return c.json({ error: 'INVALID_TARGET' }, 400);

  if (await isBlocked(followeeId, me)) return c.json({ error: 'BLOCKED' }, 403);

  const [follow, request] = await Promise.all([
    getFollow(followeeId, me),
    getFollowRequest(followeeId, me),
  ]);
  if (follow) return c.json({ error: 'ALREADY_EXISTS', status: 'accepted' }, 409);
  if (request) return c.json({ error: 'ALREADY_EXISTS', status: 'pending' }, 409);

  await putFollowRequest(me, followeeId, new Date().toISOString());
  // 레거시 sendNotification(feed_follow_request) → 도메인 이벤트 발행으로 대체
  await publishEvent('follow.requested', { followerId: me, followeeId });

  return ok(c, { followId: makeFollowId(me, followeeId), status: 'pending' }, undefined, 201);
});

// DELETE /u/feed/:userId/follow — 팔로워 자발 취소
personalFeedRoutes.delete('/:userId/follow', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const followeeId = c.req.param('userId');
  await Promise.all([deleteFollow(followeeId, me), deleteFollowRequest(followeeId, me)]);
  return ok(c);
});

// POST /u/feed/:userId/block — 차단 / DELETE — 차단 해제
personalFeedRoutes.post('/:userId/block', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const targetId = c.req.param('userId');
  if (!targetId || targetId === me) return c.json({ error: 'INVALID_TARGET' }, 400);
  await putBlockIfAbsent(me, targetId, new Date().toISOString());
  return ok(c);
});

personalFeedRoutes.delete('/:userId/block', async (c) => {
  const { userId: me } = c.get('authUser')!;
  await deleteBlock(me, c.req.param('userId'));
  return ok(c);
});

// GET /u/feed/:userId — 피드 프로필 + 레이어 (userId | 'me' | '@handle')
personalFeedRoutes.get('/:userId', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const raw = c.req.param('userId');
  return feedProfileResponse(c, me, raw === 'me' ? me : raw);
});

/**
 * /public/users — 비로그인 퍼블릭 조회 (핸들 기반).
 * 팔로우 관계가 없으므로 isPublic=true → L1, 아니면 L0 프로필만 노출.
 */
export const publicUsersRoutes = new Hono<AppEnv>();

// GET /public/users/:handle — 퍼블릭 프로필 (@ 프리픽스 유무 모두 허용)
publicUsersRoutes.get('/:handle', async (c) => {
  const raw = c.req.param('handle');
  return feedProfileResponse(c, null, raw.startsWith('@') ? raw : `@${raw}`);
});
