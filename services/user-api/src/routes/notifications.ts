import { Hono } from 'hono';
import { AppEnv, fail, ok } from '@chum7/api-kit';
import { mergeWithDefaults, pickSettingUpdates } from '../domain/notification-settings';
import {
  getNotification,
  getNotificationSettings,
  listNotifications,
  markNotificationRead,
  putNotificationSettings,
} from '../repo/notifications-repo';
import { decodeNextToken, encodeNextToken, normalizeLimit, stripKeyAttrs } from '../repo/paging';

/**
 * /u/notifications — 인앱 알림 + 알림 설정.
 * 레거시 backend/services/notification/{list,mark-read} 과
 * backend/services/notifications/settings (폴더명 분기) 를 하나로 통합 (PORTING.md 참고).
 */
export const notificationsRoutes = new Hono<AppEnv>();

// GET /u/notifications — 알림 목록 (레거시 GET /notifications + 페이지네이션 추가)
notificationsRoutes.get('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const includeRead = c.req.query('includeRead') === 'true';
  const limit = normalizeLimit(c.req.query('limit'));
  const startKey = decodeNextToken(c.req.query('nextToken'));

  const { items, lastKey } = await listNotifications(userId, limit, startKey);
  const notifications = items
    .filter((n) => includeRead || !n.isRead)
    .map((n) => stripKeyAttrs(n));

  return ok(c, { notifications, nextToken: encodeNextToken(lastKey) });
});

// POST /u/notifications/read — 읽음 처리 (레거시 mark-read: PATCH /notifications/{id}/read)
notificationsRoutes.post('/read', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = (await c.req.json().catch(() => ({}))) as { notificationId?: string };
  const notificationId = body.notificationId;

  if (!notificationId) {
    return fail(c, 400, 'MISSING_NOTIFICATION_ID', '알림 ID가 필요합니다');
  }

  // 본인 파티션에서만 조회하므로 타인 알림은 조회 자체가 안 됨 (레거시 403 케이스 → 404)
  const notification = await getNotification(userId, notificationId);
  if (!notification) {
    return fail(c, 404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다');
  }

  await markNotificationRead(userId, notificationId);
  return ok(c);
});

// GET /u/notifications/settings — 알림 설정 조회 (레거시 GET /notifications/settings)
notificationsRoutes.get('/settings', async (c) => {
  const { userId } = c.get('authUser')!;
  const saved = await getNotificationSettings(userId);
  return ok(c, { settings: mergeWithDefaults(saved) });
});

// PUT /u/notifications/settings — 알림 설정 변경 (레거시 PUT /notifications/settings)
notificationsRoutes.put('/settings', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const updates = pickSettingUpdates(body);
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'NO_VALID_FIELDS' }, 400); // 레거시 바디 그대로 (message 없음)
  }

  const now = new Date();
  const saved = await getNotificationSettings(userId);
  await putNotificationSettings(userId, { ...(saved ?? {}), ...updates }, now.toISOString());

  return ok(c, { updated: updates });
});
