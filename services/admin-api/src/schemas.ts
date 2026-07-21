/** admin-api zod 요청 스키마 — 레거시 admin 핸들러 스키마 승계 (이전 가이드 §1-1). */
import { z } from 'zod';

export const CHALLENGE_CATEGORY_ENUM = z.enum([
  'health', 'habit', 'development', 'creativity', 'relationship', 'mindfulness', 'expand', 'impact',
]);

const VERIFICATION_TYPE_ENUM = z.enum(['image', 'text', 'link', 'video']);

/** 레거시 admin/challenge/create 스키마 그대로 */
export const createChallengeSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  category: CHALLENGE_CATEGORY_ENUM,
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
  layerPolicy: z
    .object({
      requirePersonalGoalOnJoin: z.boolean().default(false),
      requirePersonalTargetOnJoin: z.boolean().default(true),
      allowExtraVisibilityToggle: z.boolean().default(true),
    })
    .default({}),
  defaultRemedyPolicy: z
    .object({
      type: z.enum(['anytime', 'last_day', 'disabled']).default('anytime'),
      maxRemedyDays: z.number().int().min(1).max(30).nullable().default(null),
    })
    .default({ type: 'anytime', maxRemedyDays: null }),
  personalQuestEnabled: z.boolean().default(false),
  personalQuestAutoApprove: z.boolean().default(false),
  requireStartConfirmation: z.boolean().default(false),
  joinApprovalRequired: z.boolean().default(true),
  allowedVerificationTypes: z.array(VERIFICATION_TYPE_ENUM).min(1).default(['image', 'text', 'link', 'video']),
});

/**
 * 레거시 admin/challenge/update 스키마 — category만 신규 8종 전체 허용
 * (레거시는 6종만 나열한 결함, gsi1 카테고리 키 동기 위해 전체로 교정 — PORTING.md)
 */
export const updateChallengeSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(10).max(1000).optional(),
  category: CHALLENGE_CATEGORY_ENUM.optional(),
  targetTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  identityKeyword: z.string().min(1).max(50).optional(),
  badgeIcon: z.string().min(1).max(10).optional(),
  badgeName: z.string().min(1).max(50).optional(),
  allowedVerificationTypes: z.array(VERIFICATION_TYPE_ENUM).min(1).optional(),
});

/** 레거시 admin/challenge/lifecycle-transition 스키마 그대로 */
export const lifecycleTransitionSchema = z.object({
  lifecycle: z.enum(['draft', 'recruiting', 'preparing', 'active', 'completed', 'archived']),
  reason: z.string().max(200).optional(),
});

/** 레거시 quest/approve 스키마 + 신규 키 탐색용 challengeId (PORTING.md §3 퀘스트 심사) */
export const questReviewSchema = z.object({
  challengeId: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  reviewNote: z.string().max(500).optional(),
});

/** 레거시 admin/category-banners/upsert 스키마 그대로 */
export const bannerUpsertSchema = z.object({
  imageUrl: z.string().url().optional(),
  tagline: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(300).optional(),
});

/** 레거시 admin/cheer/dead-letter/requeue-batch 바디 */
export const requeueBatchSchema = z.object({
  cheerIds: z.array(z.unknown()),
});

/** 레거시 admin/cheer/dead-letter/requeue-by-query 바디 */
export const requeueByQuerySchema = z.object({
  fromIso: z.string().optional(),
  toIso: z.string().optional(),
  failureCode: z.string().optional(),
  limit: z.number().optional(),
  dryRun: z.boolean().optional(),
});
