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

  // 완주 보상 — 배지는 기본 지급, 아래 둘은 있을 때만(선택). name=상품명/설명.
  rewardPhysical: z.object({ name: z.string().min(1).max(60) }).nullable().optional(),
  rewardOnline: z.object({ name: z.string().min(1).max(60) }).nullable().optional(),
  // 대표 이미지(배너 카드용) — 업로드된 CloudFront URL. 없으면 카테고리 컬러 카드로 폴백.
  coverImageUrl: z.string().url().max(1000).nullable().optional(),

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

  // 참여자 식별 방식 — 생성 시 리더가 확정. 운영탭(리더·매니저)에서만 표시되고
  // 피드·마당 등 활동 표면의 익명(랜덤 활동명)은 그대로 유지된다.
  //  realname: 가입명(실명인증 도입 전) / handle: @핸들 / custom: 참여 시 챌린지 전용 이름 입력
  leaderIdentityMode: z.enum(['realname', 'handle', 'custom']).default('realname'),

  participateAsCreator: z.boolean().default(false),
});

export const updateChallengeSchema = z.object({
  title: z.string().min(2).max(60).optional(),
  // 시작 전(draft·recruiting) 한정 정책 변경 — 라우트에서 부수효과(진행표 재구성) 처리
  leaderIdentityMode: z.enum(['realname', 'handle', 'custom']).optional(),
  defaultRemedyPolicy: z
    .object({
      type: z.enum(['anytime', 'last_day', 'disabled']),
      maxRemedyDays: z.number().int().min(1).max(30).nullable().default(null),
    })
    .optional(),
  description: z.string().min(10).max(2000).optional(),
  category: z.enum(CHALLENGE_CATEGORIES).optional(),
  targetTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  badgeIcon: z.string().max(10).optional(),
  badgeName: z.string().min(1).max(30).optional(),
  identityKeyword: z.string().min(1).max(30).optional(),
  recruitingEndAt: z.string().datetime().optional(),
  challengeStartAt: z.string().datetime().optional(),
  maxParticipants: z.number().int().min(1).max(1000).nullable().optional(),
  rewardPhysical: z.object({ name: z.string().min(1).max(60) }).nullable().optional(),
  rewardOnline: z.object({ name: z.string().min(1).max(60) }).nullable().optional(),
  coverImageUrl: z.string().url().max(1000).nullable().optional(),
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
  /** leaderIdentityMode=custom 챌린지: 리더에게만 보일 이름 (운영탭 전용) */
  leaderVisibleName: z.string().trim().min(1).max(20).optional(),
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
  // 사진 인증 다중 이미지 (최대 10) — 슬라이드 게시. imageUrl은 하위호환(첫 장).
  imageUrls: z.array(z.string().url()).max(10).optional(),
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
  imageUrls: z.array(z.string().url()).max(10).optional(),
  videoUrl: z.string().url().optional(),
  linkUrl: z.string().url().optional(),
  todayNote: z.string().max(500).optional(),
  reflectionNote: z.string().max(500).optional(),
  tomorrowPromise: z.string().max(500).optional(),
  completedAt: z.string().datetime().optional(),
  practiceAt: z.string().datetime().optional(),
  // 보완도 일반 인증과 같은 공개 정책을 따른다 (기본 공개 — 챌린지 피드·마당 노출)
  isPublic: z.boolean().default(true),
});
export type RemedyVerificationInput = z.infer<typeof remedyVerificationSchema>;

// ── 라이브 방 (음성/방송) ────────────────────────────────────────────────
export const liveRoomCreateSchema = z.object({
  // Phase 1은 음성만 — video는 모델만 예약 (리더 1인 방송, Phase 2)
  mode: z.enum(['audio', 'video']).default('audio'),
  // 저장 여부 — 개설 시 확정, 이후 변경 불가. 기본값 저장함(제품 결정)
  recording: z.boolean().default(true),
  title: z.string().trim().max(80).optional(),
});
export type LiveRoomCreateInput = z.infer<typeof liveRoomCreateSchema>;

export const liveConsentSchema = z.object({
  kind: z.enum(['record_consent', 'offrecord_ack']),
});

export const liveRecordingUrlSchema = z.object({
  // 개설자 로컬 녹음 산출물 — MediaRecorder 기본 webm(opus), Safari mp4 폴백
  contentType: z.enum(['audio/webm', 'audio/mp4', 'video/webm', 'video/mp4']),
  fileSize: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
});

export const liveRecordingCompleteSchema = z.object({
  key: z.string().min(1).max(512),
});

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

// ── 인증 완료 인정 요청 (사용자 → 리더) ──────────────────────────────────
export const completionRequestSchema = z.object({
  verificationId: z.string().min(1),
  day: z.number().int().min(1),
  message: z.string().max(500).optional(),
});
export type CompletionRequestInput = z.infer<typeof completionRequestSchema>;

// 리더 처리 — approve(완료 인정) / reject(반려)
export const completionResolveSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  feedback: z.string().max(500).optional(),
});
export type CompletionResolveInput = z.infer<typeof completionResolveSchema>;

// 완주 보상 상품 카탈로그 — 실물/기프티콘/온라인 서비스 분류, 정사각 이미지+설명.
export const rewardProductsSchema = z.object({
  products: z
    .array(
      z.object({
        productId: z.string().optional(),
        type: z.enum(['physical', 'gifticon', 'service']),
        name: z.string().trim().min(1).max(60),
        description: z.string().trim().max(500).optional(),
        imageUrl: z.string().trim().max(500).optional(),
      }),
    )
    .max(6),
});
export type RewardProductsInput = z.infer<typeof rewardProductsSchema>;

export const rewardProductUploadUrlSchema = z.object({
  fileType: z.string().regex(/^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
});

// 완주자 랜덤 추첨 — 서버 crypto 난수 추첨 + 이력 기록 (조작 시비 방지)
export const drawCreateSchema = z.object({
  winnerCount: z.number().int().min(1).max(100),
  title: z.string().trim().max(100).optional(),
  excludePreviousWinners: z.boolean().optional(),
});
export type DrawCreateInput = z.infer<typeof drawCreateSchema>;

// 유료 챌린지 해산 신청 — 리더가 운영자에게 사유와 함께 제출.
export const disbandRequestSchema = z.object({
  reason: z.string().trim().min(5, '해산 사유를 5자 이상 입력해주세요').max(500),
});
export type DisbandRequestInput = z.infer<typeof disbandRequestSchema>;

// 사용자 인증 취소 — 특정 게시물 1건의 '해당 일자 완료·점수'를 스스로 해제.
//  게시물은 남기고 노출만 선택적으로 끈다(챌린지 피드 / 개인 프로필 피드). 마당(plaza)은 항상 유지.
export const cancelVerificationSchema = z.object({
  hideFromChallengeFeed: z.boolean().optional(),
  hideFromOwnerFeed: z.boolean().optional(),
});
export type CancelVerificationInput = z.infer<typeof cancelVerificationSchema>;

// ── 리더 공통 퀘스트(리더퀘스트) 등록 — 챌린지 리더 전용, 운영탭 ────────────
// challengeId는 경로 파라미터에서 취득. admin createQuestSchema의 리더용 간이 버전
// (questScope='leader' 고정, 노출순서·시작시각 등은 서버 기본값). approvalRequired
// true면 리더/어드민 승인 후 점수 지급, false면 자동 승인.
export const createLeaderQuestSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  allowedVerificationTypes: z.array(z.enum(['image', 'video', 'link', 'text'])).min(1).optional(),
  verificationGuide: z.string().min(1).max(500).optional(),
  approvalRequired: z.boolean().default(false),
  rewardPoints: z.number().int().min(0).max(1000).default(1),
  targetTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
});
export type CreateLeaderQuestInput = z.infer<typeof createLeaderQuestSchema>;

// 리더 퀘스트 수정/중단 — 부분 수정. status='inactive'면 중단(제출 차단), 'active'면 재개.
export const updateLeaderQuestSchema = z
  .object({
    title: z.string().min(1).max(100).optional(),
    description: z.string().min(1).max(1000).optional(),
    allowedVerificationTypes: z.array(z.enum(['image', 'video', 'link', 'text'])).min(1).optional(),
    verificationGuide: z.string().min(1).max(500).optional(),
    approvalRequired: z.boolean().optional(),
    rewardPoints: z.number().int().min(0).max(1000).optional(),
    targetTime: z
      .string()
      .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '수정할 항목이 없습니다' });
export type UpdateLeaderQuestInput = z.infer<typeof updateLeaderQuestSchema>;

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
