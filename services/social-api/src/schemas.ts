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

// ── 마당(plaza) 운영자 게시 ────────────────────────────────────────────

/** 유효 카테고리 슬러그 (challenge-api CHALLENGE_CATEGORIES / interest-area 라벨맵과 동일 8종) */
export const PLAZA_ADMIN_CATEGORIES = [
  'selflove',
  'discipline',
  'create',
  'explore',
  'build',
  'attitude',
  'expand',
  'impact',
] as const;

/** 운영자 게시물 이미지 presigned PUT 요청 */
export const plazaAdminUploadUrlSchema = z.object({
  contentType: z
    .string()
    .regex(/^image\/(jpeg|jpg|png|webp|gif)$/, 'INVALID_CONTENT_TYPE')
    .default('image/jpeg'),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024)
    .optional(),
});

/** 운영자 마당 게시물 작성 — courtyard 카드로 노출 + isOfficial 배지. 본문 필수, 이미지 선택. */
export const createAdminPlazaPostSchema = z.object({
  content: z.string().min(1).max(2000),
  title: z.string().max(100).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  imageUrls: z.array(z.string().url()).max(10).optional().nullable(),
  challengeCategory: z.enum(PLAZA_ADMIN_CATEGORIES).optional().nullable(),
  hashtag: z
    .string()
    .max(30)
    .regex(/^#?[가-힣a-zA-Z0-9_-]*$/, 'HASHTAG_INVALID_CHARS')
    .optional()
    .nullable(),
});

// ── 신고(report) ───────────────────────────────────────────────────────

/** 신고 사유 — 스팸/광고, 욕설·괴롭힘, 음란물, 폭력, 혐오, 허위정보, 기타 */
export const REPORT_REASONS = [
  'spam',
  'harassment',
  'sexual',
  'violence',
  'hate',
  'misinfo',
  'other',
] as const;

export const createReportSchema = z
  .object({
    targetType: z.enum(['verification', 'plaza', 'comment']),
    targetId: z.string().min(1),
    challengeId: z.string().optional().nullable(), // 인증 숨김에 필요
    plazaPostId: z.string().optional().nullable(), // 댓글의 부모 게시물
    commentCreatedAt: z.string().optional().nullable(), // 댓글 sk 구성용
    reason: z.enum(REPORT_REASONS),
    detail: z.string().max(500).optional().nullable(),
  })
  .refine((v) => v.targetType !== 'verification' || Boolean(v.challengeId), {
    message: '인증 신고에는 challengeId가 필요합니다',
    path: ['challengeId'],
  })
  .refine((v) => v.targetType !== 'comment' || Boolean(v.plazaPostId && v.commentCreatedAt), {
    message: '댓글 신고에는 plazaPostId와 commentCreatedAt이 필요합니다',
    path: ['plazaPostId'],
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
  // 리더는 댓글마다 역할 선택: leader(챌린지 리더) / participant(일일 활동명). 기본 participant.
  authorMode: z.enum(['leader', 'participant']).optional().default('participant'),
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
