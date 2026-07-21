import { z } from 'zod';

/** 응원 보내기 (레거시 createAutoCheer 파라미터 승계 — day 필수, cheer-latest.md §2) */
export const sendCheerSchema = z.object({
  receiverId: z.string().min(1),
  challengeId: z.string().min(1),
  day: z.number().int().min(1).max(31),
  message: z.string().max(200).nullable().optional().default(null),
  /** 발신자 조기완료 여유(분) — scheduledTime = 수신자 목표 시간 - delta */
  delta: z.number().int().min(0).max(1440).optional().default(0),
  verificationId: z.string().nullable().optional().default(null),
  /** 기본값: 수신자 타임존 기준 오늘 */
  verificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type SendCheerInput = z.infer<typeof sendCheerSchema>;

/** 리액션 이모지 (레거시 react ALLOWED_REACTIONS) */
export const ALLOWED_REACTIONS = ['❤️', '🔥', '👏', '🙌', '😊'] as const;
export type ReactionType = (typeof ALLOWED_REACTIONS)[number];

export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 감사 메시지 상수 (레거시 thank-message) */
export const THANK_MAX_MESSAGE_LENGTH = 30;
export const THANK_MAX_CHEER_IDS = 50;

/** 답장 최대 길이 (레거시 reply) */
export const REPLY_MAX_MESSAGE_LENGTH = 200;
