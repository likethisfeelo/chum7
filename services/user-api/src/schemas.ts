import { z } from 'zod';

/** PATCH /u/me — 레거시 backend/services/auth/update-profile 스키마 그대로 */
export const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  profileImageUrl: z.string().url().optional().nullable(),
  identityPhrase: z.string().max(100).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** POST /u/push-subscriptions — Web Push 구독 (신규) */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
