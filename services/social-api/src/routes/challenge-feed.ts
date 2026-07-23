/**
 * 챌린지 피드(인증 카드 상호작용) 라우트 — /s/challenge-feed/:challengeId/verifications/:verificationId/...
 * 레거시: backend/services/challenge-feed/* (challenge-board-stack 배선).
 * 참여자/lifecycle 검사는 크로스 도메인 조회 — v1 JWT 신뢰 정책으로 스킵 (PORTING.md gap ①).
 * 레거시 응답 바디는 envelope 없이 `{ data: ... }` 플랫 — 그대로 유지.
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { fail, publishEvent } from '@chum7/api-kit';
import {
  verificationCommentSchema,
  verificationReactionSchema,
  VERIFICATION_REACTION_EMOJIS,
} from '../schemas';
import { createDailyAnonymousId } from '@chum7/core';
import { loadAnonSalt } from '../anon-salt';
import {
  deleteVerificationComment,
  deleteVerificationReaction,
  findVerificationCommentById,
  listVerificationComments,
  listVerificationReactions,
  putVerificationComment,
  putVerificationReaction,
  verCommentSk,
} from '../repo/verification-social';
import { verificationPk } from '../repo/shared';
import { getChallengeLeaderId } from '../repo/challenge-ref';

export const challengeFeedRoutes = new Hono<AppEnv>();

const BASE = '/:challengeId/verifications/:verificationId';

// 댓글 목록 (레거시 GET — 오래된 순 50개, displayName = 저장된 일일 익명 ID).
// 종료 후 안정 익명 공개·리더 표시(isLeader)는 lifecycle/leaderId 크로스 도메인 조회 필요 — v1 미지원 (gap ②)
challengeFeedRoutes.get(`${BASE}/comments`, async (c) => {
  const { userId } = c.get('authUser')!;
  const verificationId = c.req.param('verificationId');

  const items = await listVerificationComments(verificationId);
  const comments = items.map((item) => {
    const isLeader = item.authorMode === 'leader';
    return {
      commentId: item.commentId,
      displayName: isLeader ? '챌린지 리더' : item.dailyAnonymousId ?? '익명',
      isLeader,
      isOwn: item.userId === userId,
      content: item.content,
      createdAt: item.createdAt,
    };
  });

  return c.json({ data: comments });
});

// 댓글 작성 (레거시 POST — 300자 제한, 일일 익명 ID 저장)
challengeFeedRoutes.post(`${BASE}/comments`, async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const verificationId = c.req.param('verificationId');
  const input = verificationCommentSchema.parse(await c.req.json().catch(() => ({})));

  let dailyAnonymousId = '익명';
  try {
    dailyAnonymousId = createDailyAnonymousId(challengeId, userId, await loadAnonSalt());
  } catch {
    // ANON_ID_SALT 미설정 시 fallback (레거시 동작 승계)
  }

  // 리더 모드 요청 시 서버 검증 — 실제 리더가 아니면 참여자로 강등(변조 차단)
  let authorMode: 'leader' | 'participant' = input.authorMode ?? 'participant';
  if (authorMode === 'leader') {
    const leaderId = await getChallengeLeaderId(challengeId);
    if (!leaderId || leaderId !== userId) authorMode = 'participant';
  }
  const isLeader = authorMode === 'leader';
  const displayName = isLeader ? '챌린지 리더' : dailyAnonymousId;

  const commentId = randomUUID();
  const now = new Date().toISOString();

  await putVerificationComment({
    pk: verificationPk(verificationId),
    sk: verCommentSk(now, commentId),
    commentId,
    verificationId,
    challengeId,
    userId,
    dailyAnonymousId,
    authorMode,
    content: input.content,
    createdAt: now,
  });

  // 인증 소유자 알림 — 소유자는 challenges 도메인 데이터이므로 클라이언트 제공 시에만 발행 (gap ⑦)
  if (input.verificationOwnerId) {
    await publishEvent('comment.created', {
      targetType: 'verification',
      targetId: verificationId,
      targetOwnerId: input.verificationOwnerId,
      authorId: userId,
      commentId,
    });
  }

  return c.json({
    data: {
      commentId,
      displayName,
      isLeader,
      isOwn: true,
      content: input.content,
      createdAt: now,
    },
  });
});

// 댓글 삭제 (레거시 DELETE — 본인 댓글만)
challengeFeedRoutes.delete(`${BASE}/comments/:commentId`, async (c) => {
  const { userId } = c.get('authUser')!;
  const verificationId = c.req.param('verificationId');
  const commentId = c.req.param('commentId');

  const existing = await findVerificationCommentById(verificationId, commentId);
  if (!existing) return fail(c, 404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다');
  if (existing.userId !== userId) {
    return fail(c, 403, 'FORBIDDEN', '본인 댓글만 삭제할 수 있습니다.');
  }

  await deleteVerificationComment(verificationId, existing.sk);
  // 관계 아카이브 동기화 — 원장에서 이 댓글 원문 재노출 차단
  await publishEvent('content.deleted', {
    targetType: 'verification',
    sourceEntityType: 'comment',
    sourceEntityId: commentId,
  });
  return c.json({ data: { deleted: true, commentId } });
});

// 리액션 목록 (레거시 GET — emoji별 집계 + myReacted)
challengeFeedRoutes.get(`${BASE}/reactions`, async (c) => {
  const { userId } = c.get('authUser')!;
  const verificationId = c.req.param('verificationId');

  const items = await listVerificationReactions(verificationId);
  const emojiMap = new Map<string, { count: number; myReacted: boolean }>();
  for (const item of items) {
    const emoji: string = item.emoji;
    if (!emoji) continue;
    const existing = emojiMap.get(emoji) ?? { count: 0, myReacted: false };
    emojiMap.set(emoji, {
      count: existing.count + 1,
      myReacted: existing.myReacted || item.userId === userId,
    });
  }

  const reactions = Array.from(emojiMap.entries()).map(([emoji, { count, myReacted }]) => ({
    emoji,
    count,
    myReacted,
  }));

  return c.json({ data: reactions });
});

// 리액션 추가 (레거시 POST — 유저·인증·이모지 조합 1건, put 멱등)
challengeFeedRoutes.post(`${BASE}/reactions`, async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const verificationId = c.req.param('verificationId');
  const input = verificationReactionSchema.parse(await c.req.json().catch(() => ({})));

  if (!VERIFICATION_REACTION_EMOJIS.has(input.emoji)) {
    return fail(c, 400, 'INVALID_EMOJI', '허용되지 않은 이모지입니다.');
  }

  await putVerificationReaction({
    verificationId,
    challengeId,
    userId,
    emoji: input.emoji,
    now: new Date().toISOString(),
  });
  return c.json({ data: { added: true, emoji: input.emoji } });
});

// 리액션 제거 (레거시 DELETE)
challengeFeedRoutes.delete(`${BASE}/reactions`, async (c) => {
  const { userId } = c.get('authUser')!;
  const verificationId = c.req.param('verificationId');
  const input = verificationReactionSchema.parse(await c.req.json().catch(() => ({})));

  if (!VERIFICATION_REACTION_EMOJIS.has(input.emoji)) {
    return fail(c, 400, 'INVALID_EMOJI', '허용되지 않은 이모지입니다.');
  }

  await deleteVerificationReaction(verificationId, userId, input.emoji);
  return c.json({ data: { removed: true, emoji: input.emoji } });
});
