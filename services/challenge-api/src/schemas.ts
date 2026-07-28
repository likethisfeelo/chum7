import { z } from 'zod';
import { CHALLENGE_CATEGORIES } from './repo/challenges';

// ── 챌린지 생성/수정 (레거시 backend/services/challenge/{create,update} 스키마 승계) ──

export const createChallengeSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  category: z.enum(CHALLENGE_CATEGORIES),
  targetTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
  identityKeyword: z.string().min(1).max(50),
  badgeIcon: z.string().min(1).max(10),
  badgeName: z.string().min(1).max(50),

  recruitingStartAt: z.string().datetime(),
  recruitingEndAt: z.string().datetime(),
  challengeStartAt: z.string().datetime(),

  durationDays: z.number().int().min(1).max(30).default(7),
  maxParticipants: z.number().int().min(1).optional().nullable(),
  challengeType: z.enum(['leader_only', 'personal_only', 'leader_personal', 'mixed']).default('leader_personal'),
  layerPolicy: z.object({
    requirePersonalGoalOnJoin: z.boolean().default(false),
    requirePersonalTargetOnJoin: z.boolean().default(true),
    allowExtraVisibilityToggle: z.boolean().default(true),
  }).default({}),
  defaultRemedyPolicy: z.object({
    type: z.enum(['anytime', 'last_day', 'disabled']).default('anytime'),
    maxRemedyDays: z.number().int().min(1).max(30).nullable().default(null),
  }).default({ type: 'anytime', maxRemedyDays: null }),
  personalQuestEnabled: z.boolean().default(false),
  // 개인 퀘스트 제안 자동승인 — 기본 자동승인. false 시 리더/어드민 검토 후 승인
  personalQuestAutoApprove: z.boolean().default(true),
  requireStartConfirmation: z.boolean().default(false),
  joinApprovalRequired: z.boolean().default(false),
  allowedVerificationTypes: z.array(z.enum(['image', 'text', 'link', 'video'])).min(1).default(['image', 'text', 'link', 'video']),

  participateAsCreator: z.boolean().default(false),
});

export const updateChallengeSchema = z.object({
  title: z.string().min(2).max(60).optional(),
  description: z.string().min(10).max(2000).optional(),
  targetTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  badgeIcon: z.string().max(10).optional(),
  badgeName: z.string().min(1).max(30).optional(),
  identityKeyword: z.string().min(1).max(30).optional(),
  recruitingEndAt: z.string().datetime().optional(),
  challengeStartAt: z.string().datetime().optional(),
  maxParticipants: z.number().int().min(1).max(1000).nullable().optional(),
});

// ── 참여 (레거시 challenge/join) ────────────────────────────────────────────

export const personalTargetSchema = z.object({
  hour12: z.number().int().min(1).max(12),
  minute: z.number().int().min(0).max(59),
  meridiem: z.enum(['AM', 'PM']),
  timezone: z.string().min(1).max(100).default('Asia/Seoul'),
});

export const joinChallengeSchema = z.object({
  personalGoal: z.string().max(200).optional(),
  personalTarget: personalTargetSchema.optional(),
  /** 유료 챌린지: paid 상태 주문 ID 필수 (커머스 v0 — COMMERCE_V0.md) */
  orderId: z.string().min(1).optional(),
});

export const reviewJoinRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().optional().nullable(),
});

// ── 인증 (레거시 verification/{submit,remedy,upload-url,visibility,performed-at}) ──

export const submitVerificationSchema = z.object({
  userChallengeId: z.string().uuid(),
  day: z.number().min(1).max(30),
  verificationType: z.enum(['text', 'image', 'video', 'link']).optional(),
  questType: z.enum(['leader', 'personal']).optional(),
  questId: z.string().optional(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  videoDurationSec: z.number().min(0).max(60).optional(),
  trimStartSec: z.number().min(0).max(60).optional(),
  trimEndSec: z.number().min(0).max(60).optional(),
  videoObjectKey: z.string().min(1).optional(),
  mediaValidationStatus: z.enum(['pending', 'valid', 'invalid']).optional(),
  linkUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith('https://'), 'HTTPS_ONLY')
    .optional(),
  todayNote: z.string().max(500).optional(),
  tomorrowPromise: z.string().max(500).optional(),
  hashtag: z
    .string()
    .max(30)
    .regex(/^[가-힣a-zA-Z0-9_-]*$/, 'HASHTAG_INVALID_CHARS')
    .optional(),
  verificationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  performedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  targetTime: z.string().datetime().optional(),
  isPublic: z.boolean().default(true),
  isAnonymous: z.boolean().default(true),
});
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

export const remedyVerificationSchema = z.object({
  userChallengeId: z.string().uuid(),
  originalDay: z.number().int().min(1).max(30),
  verificationType: z.enum(['image', 'text', 'link', 'video']).optional(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  linkUrl: z.string().url().optional(),
  todayNote: z.string().max(500).optional(),
  reflectionNote: z.string().max(500).optional(),
  tomorrowPromise: z.string().max(500).optional(),
  completedAt: z.string().datetime().optional(),
  practiceAt: z.string().datetime().optional(),
});
export type RemedyVerificationInput = z.infer<typeof remedyVerificationSchema>;

export const uploadUrlSchema = z.object({
  fileName: z.string().min(1),
  fileType: z
    .string()
    .regex(
      /^(image\/(jpeg|jpg|png|webp|gif|heic|heif|heic-sequence|heif-sequence)|video\/(mp4|webm|quicktime))$/,
    ),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 500),
  challengeId: z.string().min(1).optional(),
  userChallengeId: z.string().uuid().optional(),
  mediaKind: z.enum(['video', 'image']).optional(),
  trimStartSec: z.number().min(0).max(60).optional(),
  trimEndSec: z.number().min(0).max(60).optional(),
  videoDurationSec: z.number().min(0).max(60).optional(),
});
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;

export const visibilitySchema = z.object({
  isPersonalOnly: z.literal(false),
});

export const performedAtSchema = z.object({
  performedAt: z.string().datetime(),
});

// ── 개인 퀘스트 제안 (레거시 challenge/personal-quest/submit — v1 단순화) ────

export const questProposalSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
});
export type QuestProposalInput = z.infer<typeof questProposalSchema>;

// 리더 제안 심사 (challengeId 는 경로 파라미터에서 취득 — 바디는 결정/사유만)
export const proposalReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
});
export type ProposalReviewInput = z.infer<typeof proposalReviewSchema>;

/**
 * 승인된 개인 퀘스트 제안 재반려 — 사유(≤500) + 재제출 미이행 시 처리(fallback) 선택.
 *  block         : 재제출 안 하면 참여 제한
 *  keep_original : 재제출 안 하면 기존(원래 승인) 제출본으로 자동 재승인
 */
export const proposalReRejectSchema = z.object({
  reason: z.string().max(500).optional(),
  fallback: z.enum(['block', 'keep_original']),
});
export type ProposalReRejectInput = z.infer<typeof proposalReRejectSchema>;

// ── 퀘스트 제출 (레거시 quest/submit) ───────────────────────────────────────

export const submitQuestSchema = z.object({
  userChallengeId: z.string().uuid().optional(),
  verificationType: z.enum(['image', 'video', 'link', 'text']),
  content: z.object({
    imageUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
    videoDurationSec: z.number().min(0).max(60).optional(),
    thumbnailUrl: z.string().url().optional(),
    linkUrl: z.string().url().optional(),
    textContent: z.string().min(1).max(2000).optional(),
    note: z.string().max(500).optional(),
  }),
});
