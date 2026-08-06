/**
 * 챌린지 가이드 게시판 — /s/guide/:challengeId/...
 *  리더/매니저가 가이드 글을 하나씩 게시(공지 고정 1개), 참여자는 최신순으로 읽고 글별 댓글.
 *  읽음 추적(lastReadAt)으로 안읽은 가이드 점 표시를 지원한다.
 *  쓰기: 글 작성·고정 = 리더/매니저, 글 삭제 = 리더 전용. 댓글 = 로그인 사용자(일일 익명명).
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { createDailyAnonymousId } from '@chum7/core';
import { loadAnonSalt } from '../anon-salt';
import { guidePostSchema, guideCommentSchema } from '../schemas';
import { getChallengeStaff } from '../repo/challenge-ref';
import {
  addGuidePostCommentCount,
  deleteGuideComment,
  deleteGuidePost,
  findGuideCommentById,
  findGuidePostById,
  getGuideRead,
  guideCommentSk,
  guidePostSk,
  listGuideComments,
  listGuidePosts,
  putGuideComment,
  putGuidePost,
  putGuideRead,
  setGuidePostPinned,
} from '../repo/guide';

export const guideRoutes = new Hono<AppEnv>();

const stripDbKeys = (item: Record<string, any>) => {
  const { pk, sk, ...rest } = item;
  return rest;
};

async function requireStaff(
  c: any,
  challengeId: string,
  opts?: { leaderOnly?: boolean },
): Promise<{ error?: Response; leaderId?: string }> {
  const staff = await getChallengeStaff(challengeId);
  if (!staff) return { error: fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다') };
  const { userId } = c.get('authUser')!;
  const isLeader = staff.leaderId === userId;
  const isManager = !opts?.leaderOnly && staff.managerIds.includes(userId);
  if (!isLeader && !isManager) {
    return {
      error: fail(
        c, 403, 'FORBIDDEN',
        opts?.leaderOnly ? '챌린지 리더만 사용할 수 있어요' : '챌린지 리더·매니저만 사용할 수 있어요',
      ),
    };
  }
  return { leaderId: staff.leaderId };
}

// 글 목록 — 공지(핀) 먼저, 이후 최신순. 읽음 기준(lastReadAt)과 안읽음 수 포함.
guideRoutes.get('/:challengeId/posts', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');

  const [items, lastReadAt] = await Promise.all([
    listGuidePosts(challengeId),
    getGuideRead(challengeId, userId),
  ]);
  const posts = items
    .map(stripDbKeys)
    .sort((a: any, b: any) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    })
    .map((p: any) => ({
      ...p,
      commentCount: Number(p.commentCount ?? 0),
      // 안읽음 — 마지막 확인 이후 올라온 글 (내가 쓴 글은 제외)
      unread: p.authorId !== userId && (!lastReadAt || String(p.createdAt ?? '') > lastReadAt),
    }));
  const unreadCount = posts.filter((p: any) => p.unread).length;

  return ok(c, { posts, total: posts.length, lastReadAt, unreadCount });
});

// 글 작성 — 리더/매니저
guideRoutes.post('/:challengeId/posts', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireStaff(c, challengeId);
  if (guard.error) return guard.error;
  const { userId } = c.get('authUser')!;
  const input = guidePostSchema.parse(await c.req.json().catch(() => ({})));

  const postId = randomUUID();
  const now = new Date().toISOString();
  const post = {
    postId,
    challengeId,
    authorId: userId,
    authorRole: guard.leaderId === userId ? 'leader' : 'manager',
    title: input.title?.trim() || null,
    content: input.content,
    pinned: false,
    commentCount: 0,
    createdAt: now,
  };
  await putGuidePost({ pk: `GUIDE#${challengeId}`, sk: guidePostSk(now, postId), ...post });
  return ok(c, { post }, '가이드를 게시했어요', 201);
});

// 글 삭제 — 리더 전용 (삭제 계열)
guideRoutes.delete('/:challengeId/posts/:postId', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireStaff(c, challengeId, { leaderOnly: true });
  if (guard.error) return guard.error;

  const post = await findGuidePostById(challengeId, c.req.param('postId'));
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', '가이드를 찾을 수 없습니다');
  await deleteGuidePost(challengeId, String(post.sk));
  return ok(c, { deleted: true, postId: post.postId }, '가이드를 삭제했어요');
});

// 공지 고정/해제 — 리더/매니저. 고정은 1개만 유지(기존 핀 자동 해제).
guideRoutes.put('/:challengeId/posts/:postId/pin', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireStaff(c, challengeId);
  if (guard.error) return guard.error;

  const body = await c.req.json().catch(() => ({} as any));
  const pinned = body.pinned !== false;
  const post = await findGuidePostById(challengeId, c.req.param('postId'));
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', '가이드를 찾을 수 없습니다');

  const nowIso = new Date().toISOString();
  if (pinned) {
    // 기존 핀 해제 — 공지는 맨 위 1개만
    const items = await listGuidePosts(challengeId);
    for (const item of items) {
      if (item.pinned === true && item.postId !== post.postId) {
        await setGuidePostPinned(challengeId, String(item.sk), false, nowIso);
      }
    }
  }
  await setGuidePostPinned(challengeId, String(post.sk), pinned, nowIso);
  return ok(c, { postId: post.postId, pinned }, pinned ? '공지로 고정했어요 📌' : '고정을 해제했어요');
});

// 읽음 처리 — 가이드 확인 시각 갱신 (안읽음 점 해제)
guideRoutes.post('/:challengeId/read', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  await putGuideRead(challengeId, userId, new Date().toISOString());
  return ok(c, { read: true });
});

// ── 글별 댓글 ─────────────────────────────────────────────────────────────

guideRoutes.get('/:challengeId/posts/:postId/comments', async (c) => {
  const { userId } = c.get('authUser')!;
  const postId = c.req.param('postId');
  const items = await listGuideComments(postId);
  const comments = items.map((item) => ({
    commentId: item.commentId,
    displayName: item.displayName ?? '익명',
    isLeader: item.authorRole === 'leader',
    isOwn: item.userId === userId,
    content: item.content,
    createdAt: item.createdAt,
  }));
  return ok(c, { comments, total: comments.length });
});

guideRoutes.post('/:challengeId/posts/:postId/comments', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const postId = c.req.param('postId');
  const input = guideCommentSchema.parse(await c.req.json().catch(() => ({})));

  const post = await findGuidePostById(challengeId, postId);
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', '가이드를 찾을 수 없습니다');

  // 리더는 리더 표시, 그 외는 일일 익명명 (인증 댓글과 동일 규칙)
  const staff = await getChallengeStaff(challengeId);
  const isLeader = Boolean(staff && staff.leaderId === userId);
  let displayName = '챌린지 리더';
  if (!isLeader) {
    displayName = '익명';
    try {
      displayName = createDailyAnonymousId(challengeId, userId, await loadAnonSalt());
    } catch {
      // ANON_ID_SALT 미설정 시 fallback
    }
  }

  const commentId = randomUUID();
  const now = new Date().toISOString();
  await putGuideComment({
    pk: `GUIDEPOST#${postId}`,
    sk: guideCommentSk(now, commentId),
    commentId,
    postId,
    challengeId,
    userId,
    displayName,
    authorRole: isLeader ? 'leader' : 'participant',
    content: input.content,
    createdAt: now,
  });
  await addGuidePostCommentCount(challengeId, String(post.sk), 1).catch(() => undefined);

  return ok(
    c,
    { commentId, displayName, isLeader, isOwn: true, content: input.content, createdAt: now },
    '댓글을 남겼어요',
    201,
  );
});

guideRoutes.delete('/:challengeId/posts/:postId/comments/:commentId', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const postId = c.req.param('postId');
  const commentId = c.req.param('commentId');

  const existing = await findGuideCommentById(postId, commentId);
  if (!existing) return fail(c, 404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다');
  if (existing.userId !== userId) return fail(c, 403, 'FORBIDDEN', '본인 댓글만 삭제할 수 있습니다');

  await deleteGuideComment(postId, String(existing.sk));
  const post = await findGuidePostById(challengeId, postId);
  if (post) await addGuidePostCommentCount(challengeId, String(post.sk), -1).catch(() => undefined);
  return ok(c, { deleted: true, commentId });
});
