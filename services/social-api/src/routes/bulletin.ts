/**
 * 불레틴 라우트 — /s/bulletin/:challengeId/:phase/posts...
 * 레거시: backend/services/bulletin/* (bulletin-stack — phase는 쿼리스트링/lifecycle 유추였으나
 * 신규는 경로 세그먼트로 명시. lifecycle 게이트·참여자 검사는 크로스 도메인 — v1 스킵, PORTING.md gap ①).
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail, publishEvent } from '@chum7/api-kit';
import { createDailyAnonymousId } from '@chum7/core';
import { loadAnonSalt } from '../anon-salt';
import { bulletinView } from '../domain/bulletin-view';
import { bulletinCommentSchema, bulletinCreatePostSchema, BULLETIN_PHASES } from '../schemas';
import { parseNextToken, toNextToken } from '../domain/pagination';
import {
  bulletinCommentSk,
  bulletinPostSk,
  deleteBulletinLike,
  findBulletinPostById,
  getBulletinLike,
  listBulletinComments,
  listBulletinPosts,
  putBulletinItem,
  updateBulletinPostCounter,
} from '../repo/bulletin';
import { bulletinPk } from '../repo/shared';

export const bulletinRoutes = new Hono<AppEnv>();

function validPhase(phase: string): phase is (typeof BULLETIN_PHASES)[number] {
  return (BULLETIN_PHASES as readonly string[]).includes(phase);
}

// 게시글 목록 (레거시 GET /bulletin/{id}/posts?phase= — 최신순 페이지네이션)
bulletinRoutes.get('/:challengeId/:phase/posts', async (c) => {
  const challengeId = c.req.param('challengeId');
  const phase = c.req.param('phase');
  if (!validPhase(phase)) return fail(c, 400, 'INVALID_PHASE', 'phase는 preparing 또는 active');

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 50);
  let exclusiveStartKey: Record<string, any> | undefined;
  try {
    exclusiveStartKey = parseNextToken(c.req.query('nextToken'));
  } catch {
    return fail(c, 400, 'INVALID_NEXT_TOKEN', '잘못된 nextToken입니다');
  }

  const page = await listBulletinPosts(challengeId, phase, limit, exclusiveStartKey);
  const salt = await loadAnonSalt();
  const viewerId = c.get('authUser')?.userId;
  const posts = page.items.map((it) => bulletinView(it, viewerId, salt));
  const nextToken = toNextToken(page.lastKey);

  return ok(c, {
    posts,
    total: posts.length,
    nextToken,
    hasMore: !!nextToken,
    phase,
  });
});

// 게시글 작성 (레거시 POST /bulletin/{id}/posts — 201)
bulletinRoutes.post('/:challengeId/:phase/posts', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const phase = c.req.param('phase');
  if (!validPhase(phase)) return fail(c, 400, 'INVALID_PHASE', 'phase는 preparing 또는 active');

  const input = bulletinCreatePostSchema.parse(await c.req.json());
  const postId = randomUUID();
  const now = new Date().toISOString();
  // 작성 당시 활동명 스냅샷(P1-2 패턴) — 이후 날짜가 바뀌어도 표기 고정
  const authorDisplayName = createDailyAnonymousId(challengeId, userId, await loadAnonSalt(), new Date(now));

  const post = {
    postId,
    challengeId,
    userId,
    authorDisplayName,
    phase,
    challengePhaseKey: `${challengeId}#${phase}`, // 레거시 응답 필드 유지
    content: {
      text: input.content.text,
      imageUrls: input.content.imageUrls,
      linkUrl: input.content.linkUrl ?? null,
      linkTitle: input.content.linkTitle ?? null,
    },
    likeCount: 0,
    commentCount: 0,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };

  await putBulletinItem({
    pk: bulletinPk(challengeId, phase),
    sk: bulletinPostSk(now, postId),
    ...post,
  });

  // 응답도 익명 뷰 — 작성자 본인이라 isMine=true, 실 userId 미노출
  return ok(c, bulletinView(post, userId, await loadAnonSalt()), '게시글이 작성되었습니다', 201);
});

// 좋아요 토글 (레거시 POST /bulletin/{id}/posts/{postId}/like)
bulletinRoutes.post('/:challengeId/:phase/posts/:postId/like', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const phase = c.req.param('phase');
  const postId = c.req.param('postId');
  if (!validPhase(phase)) return fail(c, 400, 'INVALID_PHASE', 'phase는 preparing 또는 active');

  const post = await findBulletinPostById(challengeId, phase, postId);
  if (!post || post.isDeleted) {
    return fail(c, 404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다');
  }

  const now = new Date().toISOString();
  const alreadyLiked = Boolean(await getBulletinLike(challengeId, phase, postId, userId));

  try {
    if (alreadyLiked) {
      await deleteBulletinLike(challengeId, phase, postId, userId);
      await updateBulletinPostCounter(challengeId, phase, post.sk, 'likeCount', -1, now);
      // 레거시 바디 유지: liked 최상위
      return c.json({ success: true, liked: false, message: '좋아요를 취소했습니다' });
    }
    await putBulletinItem({
      pk: bulletinPk(challengeId, phase),
      sk: `LIKE#${postId}#${userId}`,
      likeId: `${postId}#${userId}`,
      postId,
      userId,
      createdAt: now,
    });
    await updateBulletinPostCounter(challengeId, phase, post.sk, 'likeCount', 1, now);
    return c.json({ success: true, liked: true, message: '좋아요를 눌렀습니다' });
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      // 동시 요청 경쟁 조건 — 레거시처럼 성공 처리
      return c.json({ success: true, message: '처리되었습니다' });
    }
    throw error;
  }
});

// 댓글 목록 (레거시 GET /bulletin/{id}/posts/{postId}/comments — 오래된 순)
bulletinRoutes.get('/:challengeId/:phase/posts/:postId/comments', async (c) => {
  const challengeId = c.req.param('challengeId');
  const phase = c.req.param('phase');
  const postId = c.req.param('postId');
  if (!validPhase(phase)) return fail(c, 400, 'INVALID_PHASE', 'phase는 preparing 또는 active');

  const limit = Math.min(parseInt(c.req.query('limit') ?? '30', 10), 100);
  let exclusiveStartKey: Record<string, any> | undefined;
  try {
    exclusiveStartKey = parseNextToken(c.req.query('nextToken'));
  } catch {
    return fail(c, 400, 'INVALID_NEXT_TOKEN', '잘못된 nextToken입니다');
  }

  const page = await listBulletinComments(challengeId, phase, postId, limit, exclusiveStartKey);
  const salt = await loadAnonSalt();
  const viewerId = c.get('authUser')?.userId;
  const comments = page.items.map((it) => bulletinView(it, viewerId, salt));
  const nextToken = toNextToken(page.lastKey);

  return ok(c, { comments, total: comments.length, nextToken, hasMore: !!nextToken });
});

// 댓글 작성 (레거시 POST /bulletin/{id}/posts/{postId}/comments — 201, 1단 depth)
bulletinRoutes.post('/:challengeId/:phase/posts/:postId/comments', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const phase = c.req.param('phase');
  const postId = c.req.param('postId');
  if (!validPhase(phase)) return fail(c, 400, 'INVALID_PHASE', 'phase는 preparing 또는 active');

  const input = bulletinCommentSchema.parse(await c.req.json());

  const post = await findBulletinPostById(challengeId, phase, postId);
  if (!post || post.isDeleted) {
    return fail(c, 404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다');
  }

  const commentId = randomUUID();
  const now = new Date().toISOString();
  const salt = await loadAnonSalt();
  const authorDisplayName = createDailyAnonymousId(challengeId, userId, salt, new Date(now));
  const comment = {
    commentId,
    postId,
    challengeId,
    userId,
    authorDisplayName,
    content: input.content,
    isDeleted: false,
    createdAt: now,
  };

  await putBulletinItem({
    pk: bulletinPk(challengeId, phase),
    sk: bulletinCommentSk(postId, now, commentId),
    phase,
    ...comment,
  });
  await updateBulletinPostCounter(challengeId, phase, post.sk, 'commentCount', 1, now);

  // 게시글 작성자 알림 — 레거시 직접 알림 기록 없음, 신규 이벤트 발행 계약
  if (post.userId) {
    await publishEvent('comment.created', {
      targetType: 'bulletin',
      targetId: postId,
      targetOwnerId: post.userId,
      authorId: userId,
      commentId,
      actorDisplayName: authorDisplayName,
    });
  }

  return ok(c, bulletinView(comment, userId, salt), '댓글이 작성되었습니다', 201);
});
