import { Hono } from 'hono';
import { AppEnv, fail, ok } from '@chum7/api-kit';
import { updateProfileSchema } from '../schemas';
import { updateProfileFields } from '../repo/profile-repo';
import { stripKeyAttrs } from '../repo/paging';

/**
 * /u — 프로필 (레거시 backend/services/auth/update-profile 계약 승계).
 */
export const profileRoutes = new Hono<AppEnv>();

// PATCH /u/me — 프로필 수정 (레거시 PUT /auth/profile 핸들러)
profileRoutes.patch('/me', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = await c.req.json().catch(() => ({}));
  const input = updateProfileSchema.parse(body);

  // 업데이트할 필드가 있는지 확인 (레거시 동작 그대로)
  if (Object.keys(input).length === 0) {
    return fail(c, 400, 'NO_UPDATE_FIELDS', '업데이트할 항목이 없습니다');
  }

  const updated = await updateProfileFields(userId, input, new Date());
  return ok(c, updated ? stripKeyAttrs(updated) : undefined, '프로필이 업데이트되었습니다');
});
