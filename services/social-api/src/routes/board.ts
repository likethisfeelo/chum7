/**
 * 챌린지보드 라우트.
 * 보호:   /s/board/:challengeId (GET·POST), .../comments (GET·POST),
 *         .../comments/:commentId/{quote,react} (POST), .../preview (POST), .../leader-dm (POST)
 * 퍼블릭: GET /public/board/:challengeId/preview
 * 레거시: backend/services/challenge-board/* (challenge-board-stack).
 * 주의: 레거시 참여자/리더 검사는 user-challenges·challenges 크로스 도메인 조회 —
 *       v1은 JWT 신뢰 정책으로 스킵 (PORTING.md gap ① 참조). 응답 바디는 레거시 그대로
 *       (보드 계열은 envelope 없이 플랫 바디였음 — 계약 유지).
 */
import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { fail, publishEvent } from '@chum7/api-kit';
import {
  boardCommentSchema,
  boardReactSchema,
  leaderDmSchema,
  quoteCommentSchema,
  upsertBoardSchema,
  upsertPreviewSchema,
} from '../schemas';
import { validateBlocks } from '../domain/blocks';
import { anonSaltFromEnv, createDailyAnonymousId } from '../domain/anonymous-id';
import { parseNextToken, toNextToken } from '../domain/pagination';
import {
  boardCommentSk,
  findBoardCommentById,
  getBoard,
  getDmThread,
  getPreview,
  listBoardComments,
  markCommentQuoted,
  putBoard,
  putBoardComment,
  putDmThread,
  putPreview,
  updateBoardCommentReaction,
} from '../repo/board';
import { boardPk } from '../repo/shared';

const EMOJI_ATTR: Record<string, string> = {
  '❤️': 'reaction_heart',
  '🔥': 'reaction_fire',
  '👏': 'reaction_clap',
};

const setSize = (s: any): number => {
  if (!s) return 0;
  if (s instanceof Set) return s.size;
  if (Array.isArray(s)) return s.length;
  return 0;
};
const setHas = (s: any, v: string): boolean => {
  if (!s) return false;
  if (s instanceof Set) return s.has(v);
  if (Array.isArray(s)) return s.includes(v);
  return false;
};

// ═══ 퍼블릭 ═══════════════════════════════════════════════════════════

export const boardPublicRoutes = new Hono<AppEnv>();

// 프리뷰 조회 (레거시 GET /preview-board/{id}·/challenge-preview/{id}).
// 레거시 프리필은 challenges 테이블 조회+저장 — 크로스 도메인 금지로 v1은 비영속 기본 프리필 반환 (gap ③)
boardPublicRoutes.get('/:challengeId/preview', async (c) => {
  const challengeId = c.req.param('challengeId');
  const preview = await getPreview(challengeId);
  if (preview) {
    return c.json({
      challengeId,
      blocks: preview.blocks ?? [],
      updatedAt: preview.updatedAt ?? null,
      updatedBy: preview.updatedBy ?? null,
    });
  }
  return c.json({
    challengeId,
    blocks: [
      { id: 'prefill-type', type: 'text', order: 1, content: '챌린지 유형: -' },
      { id: 'prefill-schedule', type: 'text', order: 2, content: '일정: - ~ -' },
      { id: 'prefill-howto', type: 'text', order: 3, content: '참여 방식: 챌린지 설명을 입력해 주세요.' },
    ],
    updatedAt: new Date().toISOString(),
    updatedBy: 'system-prefill',
  });
});

// ═══ 보호 (/s/board) ══════════════════════════════════════════════════

export const boardRoutes = new Hono<AppEnv>();

// 보드 조회 (레거시 GET /challenge-board/{id} — 플랫 바디)
boardRoutes.get('/:challengeId', async (c) => {
  const challengeId = c.req.param('challengeId');
  const board = await getBoard(challengeId);
  return c.json(
    board ?? { challengeId, blocks: [], editors: [], isPublic: false, updatedAt: null, updatedBy: null },
  );
});

// 보드 업서트 (레거시 POST /challenge-board/{id} — 리더 전용이었으나 v1 gap ①)
boardRoutes.post('/:challengeId', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const input = upsertBoardSchema.parse(await c.req.json());

  const check = validateBlocks(input.blocks, true);
  if (!check.valid) return fail(c, 400, 'VALIDATION_ERROR', check.message ?? '블록이 올바르지 않습니다');

  const now = new Date().toISOString();
  await putBoard({
    challengeId,
    blocks: input.blocks,
    editors: input.editors ?? [],
    updatedAt: now,
    updatedBy: userId,
  });

  return c.json({ success: true, updatedAt: now });
});

// 댓글 목록 (레거시 GET /challenge-board/{id}/comments — 플랫 바디).
// challengeCompleted(종료 후 안정 익명 공개)는 lifecycle 크로스 도메인 조회 필요 — v1 false 고정 (gap ②)
boardRoutes.get('/:challengeId/comments', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);

  let exclusiveStartKey: Record<string, any> | undefined;
  try {
    exclusiveStartKey = parseNextToken(c.req.query('nextToken'));
  } catch {
    return fail(c, 400, 'INVALID_NEXT_TOKEN', '잘못된 nextToken입니다');
  }

  const page = await listBoardComments(challengeId, limit, exclusiveStartKey);
  const challengeCompleted = false;

  const comments = page.items.map((item) => ({
    commentId: item.commentId,
    challengeId: item.challengeId,
    dailyAnonymousId: item.dailyAnonymousId ?? '익명-000',
    isRevealed: challengeCompleted,
    content: item.content,
    isQuoted: !!item.isQuoted,
    quotedAt: item.quotedAt ?? null,
    createdAt: item.createdAt,
    parentCommentId: item.parentCommentId ?? null,
    reactions: {
      '❤️': setSize(item.reaction_heart),
      '🔥': setSize(item.reaction_fire),
      '👏': setSize(item.reaction_clap),
    },
    myReactions: [
      ...(setHas(item.reaction_heart, userId) ? ['❤️'] : []),
      ...(setHas(item.reaction_fire, userId) ? ['🔥'] : []),
      ...(setHas(item.reaction_clap, userId) ? ['👏'] : []),
    ],
  }));

  return c.json({
    comments,
    challengeCompleted,
    nextToken: toNextToken(page.lastKey),
    hasMore: !!page.lastKey,
  });
});

// 댓글 작성 (레거시 POST /challenge-board/{id}/comments — 플랫 바디)
boardRoutes.post('/:challengeId/comments', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const input = boardCommentSchema.parse(await c.req.json());

  let dailyAnonymousId: string;
  try {
    dailyAnonymousId = createDailyAnonymousId(challengeId, userId, anonSaltFromEnv());
  } catch {
    return fail(c, 500, 'ANON_SALT_NOT_CONFIGURED', '익명 ID 설정값이 누락되었습니다');
  }

  const now = new Date().toISOString();
  const commentId = randomUUID();

  await putBoardComment({
    pk: boardPk(challengeId),
    sk: boardCommentSk(now, commentId),
    commentId,
    challengeId,
    userId,
    dailyAnonymousId,
    content: input.content,
    isQuoted: false,
    quotedAt: null,
    createdAt: now,
    ...(input.parentCommentId ? { parentCommentId: input.parentCommentId } : {}),
  });

  // 보드 소유자(리더)에게 알림 이벤트 — 레거시 kpi-log 대체 (updatedBy = 마지막 편집 리더)
  const board = await getBoard(challengeId);
  if (board?.updatedBy && board.updatedBy !== 'system-prefill') {
    await publishEvent('comment.created', {
      targetType: 'board',
      targetId: challengeId,
      targetOwnerId: board.updatedBy,
      authorId: userId,
      commentId,
    });
  }

  return c.json({ commentId, dailyAnonymousId, content: input.content, createdAt: now });
});

// 댓글 인용 (레거시 POST /challenge-board/{id}/comments/{commentId}/quote — 리더 전용, v1 gap ①)
boardRoutes.post('/:challengeId/comments/:commentId/quote', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const commentId = c.req.param('commentId');
  const input = quoteCommentSchema.parse(await c.req.json().catch(() => ({})));
  const insertAfterBlockId = input.insertAfterBlockId ?? null;

  const [board, comment] = await Promise.all([
    getBoard(challengeId),
    findBoardCommentById(challengeId, commentId),
  ]);
  if (!comment) return fail(c, 404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다');

  const blocks = Array.isArray(board?.blocks) ? [...board.blocks] : [];
  const newBlock = {
    id: `q-${randomUUID()}`,
    type: 'quote',
    commentId,
    authorName: comment.dailyAnonymousId ?? comment.authorName ?? '익명-000',
    content: comment.content,
  };

  if (!insertAfterBlockId) {
    blocks.push(newBlock);
  } else {
    const idx = blocks.findIndex((b: any) => b.id === insertAfterBlockId);
    if (idx === -1) blocks.push(newBlock);
    else blocks.splice(idx + 1, 0, newBlock);
  }

  const now = new Date().toISOString();
  await putBoard({ challengeId, blocks, editors: board?.editors ?? [], updatedAt: now, updatedBy: userId });
  await markCommentQuoted(challengeId, comment.sk, now);

  return c.json({ success: true, newBlock });
});

// 댓글 리액션 (레거시 POST /challenge-board/{id}/comments/{commentId}/react)
boardRoutes.post('/:challengeId/comments/:commentId/react', async (c) => {
  const challengeId = c.req.param('challengeId');
  const commentId = c.req.param('commentId');
  const { userId } = c.get('authUser')!;
  const input = boardReactSchema.parse(await c.req.json());

  const attrName = EMOJI_ATTR[input.emoji];
  if (!attrName) return fail(c, 400, 'INVALID_EMOJI', '지원하지 않는 이모지입니다 (❤️ 🔥 👏)');
  if (input.action !== 'add' && input.action !== 'remove') {
    return fail(c, 400, 'INVALID_ACTION', 'action은 add 또는 remove');
  }

  const comment = await findBoardCommentById(challengeId, commentId);
  if (!comment) return fail(c, 404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다');

  try {
    await updateBoardCommentReaction(challengeId, comment.sk, attrName, input.action, userId);
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return fail(c, 404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다');
    }
    throw error;
  }

  return c.json({ success: true, emoji: input.emoji, action: input.action });
});

// 프리뷰 업서트 (레거시 POST /preview-board/{id}·/challenge-preview/{id} — 리더 전용, v1 gap ①)
boardRoutes.post('/:challengeId/preview', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const input = upsertPreviewSchema.parse(await c.req.json());

  const check = validateBlocks(input.blocks, false);
  if (!check.valid) return fail(c, 400, 'VALIDATION_ERROR', check.message ?? '블록이 올바르지 않습니다');

  const now = new Date().toISOString();
  await putPreview({ challengeId, blocks: input.blocks, updatedAt: now, updatedBy: userId });

  return c.json({ success: true, updatedAt: now });
});

// 리더 DM 스레드 (레거시 POST /challenge-feed/{id}/leader-dm).
// 레거시는 challenges에서 리더를 찾고 notifications 테이블에 직접 기록 —
// v1은 leaderId를 바디로 받고(gap ④) 스레드 마커만 social 테이블에 기록.
boardRoutes.post('/:challengeId/leader-dm', async (c) => {
  const participantId = c.get('authUser')!.userId;
  const challengeId = c.req.param('challengeId');
  const input = leaderDmSchema.parse(await c.req.json());

  const raw = `${challengeId}:${participantId}:${input.leaderId}`;
  const threadId = `ldm-${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;

  const existing = await getDmThread(challengeId, participantId);
  if (existing) {
    return c.json({ threadId: existing.threadId ?? threadId, isNew: false, deepLink: `/messages/${existing.threadId ?? threadId}` });
  }

  const now = new Date().toISOString();
  await putDmThread({
    pk: boardPk(challengeId),
    sk: `DM#${participantId}`,
    threadId,
    challengeId,
    participantId,
    leaderId: input.leaderId,
    createdAt: now,
  });

  return c.json({ threadId, isNew: true, deepLink: `/messages/${threadId}` });
});
