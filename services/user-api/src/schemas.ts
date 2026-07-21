import { z } from 'zod';

/** PATCH /u/me — 레거시 backend/services/auth/update-profile 스키마 그대로 */
export const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  profileImageUrl: z.string().url().optional().nullable(),
  identityPhrase: z.string().max(100).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * POST /u/feed/me/posts/upload-url — 자유글 이미지 presigned PUT
 * (레거시 personal-feed/posts upload-url 바디 `{ contentType, fileName }` 승계 +
 *  challenge-api upload-url 의 콘텐츠 타입/크기 검증 미러 — 이미지 전용)
 */
export const postUploadUrlSchema = z.object({
  contentType: z
    .string()
    .regex(/^image\/(jpeg|jpg|png|webp|gif|heic|heif|heic-sequence|heif-sequence)$/)
    .default('image/jpeg'),
  fileName: z.string().min(1).optional(),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024)
    .optional(),
});
export type PostUploadUrlInput = z.infer<typeof postUploadUrlSchema>;

/** POST /u/push-subscriptions — Web Push 구독 (신규) */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
