import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { AppEnv, ok, publishEvent } from '@chum7/api-kit';
import { layerForPosts, visibilityAccessible } from '../domain/feed-visibility';
import { getFollow } from '../repo/graph-repo';
import {
  createInviteLink,
  deleteInviteLinkByToken,
  getInviteLinkByToken,
  incrementInviteUse,
  listInviteLinks,
} from '../repo/invite-repo';
import {
  deletePersonalPost,
  deleteSavedPost,
  findPersonalPost,
  getSavedPost,
  listPersonalPosts,
  listSavedPosts,
  putPersonalPost,
  putSavedPost,
  updatePersonalPost,
} from '../repo/posts-repo';
import { decodeNextToken, encodeNextToken, normalizeLimit } from '../repo/paging';
import {
  UPLOAD_URL_EXPIRES_SEC,
  buildFeedImageKey,
  presignFeedImagePut,
  signFeedImageUrl,
} from '../repo/media';
import { getProfileItem } from '../repo/profile-repo';
import { postUploadUrlSchema } from '../schemas';

/**
 * /u/feed — 자유글(개인 포스트)·저장 게시물·초대 링크.
 * 레거시 backend/services/personal-feed/{posts,saved-posts,invite} 계약 승계.
 * (personal-feed.ts 와 같은 프리픽스에 마운트 — 400줄 제한 분할)
 */
export const personalFeedContentRoutes = new Hono<AppEnv>();

const VISIBILITIES = ['private', 'followers', 'mutual'];

// ── 초대 링크 (레거시 personal-feed/invite) ───────────────────────────────

// GET /u/feed/invite/:token — 토큰으로 피드 주인 확인 (+사용 횟수 증가)
personalFeedContentRoutes.get('/invite/:token', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const token = c.req.param('token');

  const link = await getInviteLinkByToken(token);
  if (!link) return c.json({ error: 'LINK_NOT_FOUND' }, 404);

  const nowSec = Math.floor(Date.now() / 1000);
  if (link.expiresAtTimestamp && link.expiresAtTimestamp < nowSec) {
    return c.json({ error: 'LINK_EXPIRED' }, 410);
  }
  if (link.maxUses && link.usedCount >= link.maxUses) {
    return c.json({ error: 'LINK_EXHAUSTED' }, 410);
  }

  await incrementInviteUse(token);
  if (link.ownerId !== me) {
    await publishEvent('feed.invite_link_used', {
      ownerId: link.ownerId,
      usedByUserId: me,
      token,
    });
  }

  // 주소 래핑 정책: 랜딩이 원본 userId 대신 @handle 주소로 이동할 수 있게 핸들을 함께 내린다
  const ownerProfile = await getProfileItem(link.ownerId);
  const ownerHandle = (ownerProfile?.feedHandle as string | undefined) ?? null;
  return ok(c, { ownerId: link.ownerId, ownerHandle, inviteLinkId: link.inviteLinkId });
});

// POST /u/feed/me/invite-links — 초대 링크 생성
personalFeedContentRoutes.post('/me/invite-links', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const body = (await c.req.json().catch(() => ({}))) as { maxUses?: number; expiresAt?: string };

  // 주소 래핑 정책: 초대 랜딩이 @handle 주소로만 이동하므로 링크 생성 전에 핸들이 필요하다
  const myProfile = await getProfileItem(me);
  if (!myProfile?.feedHandle) {
    return c.json(
      { error: 'HANDLE_REQUIRED', message: '초대 링크를 만들려면 먼저 @핸들을 설정해주세요' },
      400,
    );
  }

  const inviteLinkId = randomUUID();
  const token = randomBytes(16).toString('base64url');
  const now = new Date().toISOString();
  const expiresAtTimestamp = body.expiresAt
    ? Math.floor(new Date(body.expiresAt).getTime() / 1000)
    : undefined;

  await createInviteLink({
    inviteLinkId,
    ownerId: me,
    token,
    maxUses: body.maxUses ?? null,
    usedCount: 0,
    expiresAt: body.expiresAt ?? null,
    expiresAtTimestamp,
    createdAt: now,
  });

  return ok(
    c,
    { inviteLinkId, token, maxUses: body.maxUses ?? null, expiresAt: body.expiresAt ?? null },
    undefined,
    201,
  );
});

// GET /u/feed/me/invite-links — 내 링크 목록
personalFeedContentRoutes.get('/me/invite-links', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const links = await listInviteLinks(me);
  return ok(c, {
    links: links.map((l) => ({
      inviteLinkId: l.inviteLinkId,
      token: l.token,
      maxUses: l.maxUses,
      usedCount: l.usedCount,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
    })),
  });
});

// DELETE /u/feed/me/invite-links/:linkId — 링크 삭제 (소유자 확인)
personalFeedContentRoutes.delete('/me/invite-links/:linkId', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const linkId = c.req.param('linkId');

  // 소유자 파티션(gsi2)에서만 찾으므로 타인 링크는 조회 불가 (레거시 403 케이스 → 404)
  const link = (await listInviteLinks(me)).find((l) => l.inviteLinkId === linkId);
  if (!link) return c.json({ error: 'NOT_FOUND' }, 404);

  await deleteInviteLinkByToken(link.token);
  return ok(c);
});

// ── 자유글 (레거시 personal-feed/posts) ──────────────────────────────────

// POST /u/feed/me/posts/upload-url — 이미지 업로드 presigned PUT
// (레거시 personal-feed/posts upload-url 복원 — 키 패턴 신규: uploads/<userId>/feed/<uuid>.<ext>)
personalFeedContentRoutes.post('/me/posts/upload-url', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const input = postUploadUrlSchema.parse(await c.req.json().catch(() => ({})));

  if (!process.env.UPLOADS_BUCKET) {
    return c.json({ error: 'UPLOADS_BUCKET_NOT_CONFIGURED', message: '업로드 설정이 올바르지 않습니다' }, 500);
  }

  const key = buildFeedImageKey(me, input.contentType);
  const uploadUrl = await presignFeedImagePut(me, key, input.contentType);

  const stage = process.env.STAGE || 'dev';
  const cloudfrontDomain = stage === 'prod' ? 'https://www.chum7.com' : 'https://test.chum7.com';

  return ok(c, { uploadUrl, key, fileUrl: `${cloudfrontDomain}/${key}`, expiresIn: UPLOAD_URL_EXPIRES_SEC });
});

// POST /u/feed/me/posts — 게시물 작성
personalFeedContentRoutes.post('/me/posts', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const body = (await c.req.json().catch(() => ({}))) as {
    content?: string;
    imageKeys?: string[];
    visibility?: string;
  };

  const content = (body.content ?? '').trim();
  const imageKeys = Array.isArray(body.imageKeys) ? body.imageKeys.slice(0, 5) : [];
  const visibility = VISIBILITIES.includes(body.visibility ?? '') ? body.visibility! : 'followers';

  if (!content && imageKeys.length === 0) {
    return c.json({ error: 'EMPTY_POST' }, 400);
  }

  const postId = randomUUID();
  const now = new Date().toISOString();
  await putPersonalPost(me, { postId, content, imageKeys, visibility, createdAt: now });

  return ok(c, { postId, visibility, createdAt: now }, undefined, 201);
});

// GET /u/feed/:userId/posts — 게시물 목록 (visibility·레이어 필터)
personalFeedContentRoutes.get('/:userId/posts', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const param = c.req.param('userId');
  const targetUserId = param === 'me' ? me : param;
  const isOwn = targetUserId === me;

  let layer = 4;
  if (!isOwn) {
    const [fwd, rev] = await Promise.all([
      getFollow(targetUserId, me),
      getFollow(me, targetUserId),
    ]);
    layer = layerForPosts(false, !!fwd, !!rev);
  }

  const limit = normalizeLimit(c.req.query('limit'));
  const startKey = decodeNextToken(c.req.query('nextToken'));
  const { items, lastKey } = await listPersonalPosts(targetUserId, limit, startKey);

  const posts = await Promise.all(
    items
      .filter((post) => isOwn || visibilityAccessible(post.visibility, layer))
      .map(async (post) => ({
        postId: post.postId,
        userId: post.userId,
        // 레거시 signMediaUrl 정책 복원 — imageKeys → 1시간 presigned GET URL
        imageUrls: await Promise.all(
          ((post.imageKeys ?? []) as string[]).map((k) => signFeedImageUrl(k)),
        ),
        content: post.content,
        visibility: post.visibility,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      })),
  );

  return ok(c, { posts, nextToken: encodeNextToken(lastKey) });
});

// PUT /u/feed/me/posts/:postId — 게시물 수정
personalFeedContentRoutes.put('/me/posts/:postId', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const postId = c.req.param('postId');

  // 본인 파티션에서만 찾으므로 타인 게시물은 조회 불가 (레거시 403 케이스 → 404)
  const post = await findPersonalPost(me, postId);
  if (!post) return c.json({ error: 'NOT_FOUND' }, 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    content?: string;
    imageKeys?: string[];
    visibility?: string;
  };

  await updatePersonalPost(
    me,
    post.sk,
    {
      ...(body.content !== undefined ? { content: body.content.trim() } : {}),
      ...(Array.isArray(body.imageKeys) ? { imageKeys: body.imageKeys.slice(0, 5) } : {}),
      ...(VISIBILITIES.includes(body.visibility ?? '') ? { visibility: body.visibility } : {}),
    },
    new Date().toISOString(),
  );
  return ok(c);
});

// DELETE /u/feed/me/posts/:postId — 게시물 삭제
personalFeedContentRoutes.delete('/me/posts/:postId', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const post = await findPersonalPost(me, c.req.param('postId'));
  if (!post) return c.json({ error: 'NOT_FOUND' }, 404);

  await deletePersonalPost(me, post.sk);
  return ok(c);
});

// ── 저장 게시물 (레거시 personal-feed/saved-posts, /plaza/... 경로) ────────

// POST /u/feed/plaza/:plazaPostId/save — 광장 게시물 저장
personalFeedContentRoutes.post('/plaza/:plazaPostId/save', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const plazaPostId = c.req.param('plazaPostId');

  const existing = await getSavedPost(me, plazaPostId);
  if (existing) return c.json({ error: 'ALREADY_SAVED', saveId: existing.saveId }, 409);

  // GAP: 레거시의 광장 게시물 존재 확인 + postSnapshot 기록은 social 도메인 테이블
  // 크로스 도메인 read — 미이관 (PORTING.md 참고).
  const saveId = randomUUID();
  const savedAt = new Date().toISOString();
  await putSavedPost(me, { saveId, plazaPostId, savedAt });

  return ok(c, { saveId, savedAt }, undefined, 201);
});

// DELETE /u/feed/plaza/:plazaPostId/save — 저장 취소
personalFeedContentRoutes.delete('/plaza/:plazaPostId/save', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const plazaPostId = c.req.param('plazaPostId');

  const existing = await getSavedPost(me, plazaPostId);
  if (!existing) return c.json({ error: 'NOT_SAVED' }, 404);

  await deleteSavedPost(me, plazaPostId);
  return ok(c);
});

// GET /u/feed/plaza/:plazaPostId/save/status — 저장 여부 확인
personalFeedContentRoutes.get('/plaza/:plazaPostId/save/status', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const existing = await getSavedPost(me, c.req.param('plazaPostId'));
  return ok(c, { saved: !!existing, saveId: existing ? existing.saveId : null });
});

// GET /u/feed/me/saved-posts — 저장된 게시물 목록
personalFeedContentRoutes.get('/me/saved-posts', async (c) => {
  const { userId: me } = c.get('authUser')!;
  const limit = normalizeLimit(c.req.query('limit'));
  const startKey = decodeNextToken(c.req.query('nextToken'));

  const { items, lastKey } = await listSavedPosts(me, limit, startKey);
  return ok(c, {
    savedPosts: items.map((s) => ({
      saveId: s.saveId,
      plazaPostId: s.plazaPostId,
      savedAt: s.savedAt,
      postSnapshot: s.postSnapshot ?? null,
    })),
    nextToken: encodeNextToken(lastKey),
  });
});
