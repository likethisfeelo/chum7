import { z } from 'zod';
import { USER_CREATABLE_POST_TYPES } from './domain/plaza-view';

// ── 마당(plaza) ────────────────────────────────────────────────────────

/** 게시물 작성 — 모집글(recruitment)/진행소식(progress_update)/뱃지후기(badge_review).
 *  courtyard는 plaza-converter 워커 전용 (사용자 작성 불가). */
export const createPlazaPostSchema = z.object({
  postType: z.enum(USER_CREATABLE_POST_TYPES),
  content: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional().nullable(),
  challengeId: z.string().optional().nullable(),
  challengeTitle: z.string().max(100).optional().nullable(),
  challengeCategory: z.string().max(50).optional().nullable(),
  currentDay: z.number().int().min(1).optional().nullable(),
  leaderName: z.string().max(50).optional().nullable(),
  leaderMessage: z.string().max(500).optional().nullable(),
  recruitmentData: z.record(z.any()).optional().nullable(),
  hashtag: z
    .string()
    .max(30)
    .regex(/^#?[가-힣a-zA-Z0-9_-]*$/, 'HASHTAG_INVALID_CHARS')
    .optional(),
});

/** 마당 댓글 (레거시: content 필수, 300자 제한) */
export const plazaCommentSchema = z.object({
  content: z.string().trim().min(1).max(300),
});

/** 마당 리액션 (레거시 plaza/react 바디 승계) */
export const plazaReactSchema = z.object({
  reactionType: z.string().max(30).optional(),
  challengeId: z.string().optional().nullable(),
  verificationId: z.string().optional().nullable(),
});

// ── 챌린지보드 ─────────────────────────────────────────────────────────

/** blocks 상세 검증은 domain/blocks.validateBlocks (레거시 규칙 그대로) */
export const upsertBoardSchema = z.object({
  blocks: z.array(z.any()),
  editors: z.array(z.any()).optional(),
});

export const upsertPreviewSchema = z.object({
  blocks: z.array(z.any()),
});

/** 보드 댓글 (레거시: 1000자 제한, parentCommentId 선택) */
export const boardCommentSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  parentCommentId: z.string().optional(),
});

export const quoteCommentSchema = z.object({
  insertAfterBlockId: z.string().optional().nullable(),
});

export const BOARD_REACTION_EMOJIS = ['❤️', '🔥', '👏'] as const;

export const boardReactSchema = z.object({
  emoji: z.string(),
  action: z.string(),
});

/** 리더 DM — leaderId는 v1에서 클라이언트 제공 (challenges 크로스 도메인 조회 금지, PORTING.md gap) */
export const leaderDmSchema = z.object({
  leaderId: z.string().min(1),
});

// ── 챌린지 피드 (인증 카드 상호작용) ───────────────────────────────────

/** 인증 댓글 (레거시: 300자 제한). verificationOwnerId는 comment.created 이벤트용(선택) */
export const verificationCommentSchema = z.object({
  content: z.string().trim().min(1).max(300),
  verificationOwnerId: z.string().optional(),
});

export const VERIFICATION_REACTION_EMOJIS = new Set([
  '🔥', '💪', '👏', '❤️', '🎉', '⭐', '😮', '😂', '🙌', '💡',
]);

export const verificationReactionSchema = z.object({
  emoji: z.string(),
});

// ── 불레틴 ─────────────────────────────────────────────────────────────

export const BULLETIN_PHASES = ['preparing', 'active'] as const;

/** 게시글 작성 (레거시 create-post 스키마 그대로) */
export const bulletinCreatePostSchema = z.object({
  content: z.object({
    text: z.string().min(1).max(2000),
    imageUrls: z.array(z.string().url()).max(4).default([]),
    linkUrl: z.string().url().optional().nullable(),
    linkTitle: z.string().max(100).optional().nullable(),
  }),
});

/** 댓글 작성 (레거시: 500자 제한, 1단 depth) */
export const bulletinCommentSchema = z.object({
  content: z.string().min(1).max(500),
});
