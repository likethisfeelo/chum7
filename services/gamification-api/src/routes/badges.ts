import { Hono } from 'hono';
import { AppEnv, ok } from '@chum7/api-kit';
import { toBadgeListView } from '../domain/views';
import { listBadges } from '../repo/badges';

export const badgesRoutes = new Hono<AppEnv>();

// GET /g/badges  (레거시 GET /users/me/badges — badge/list 계약 그대로)
badgesRoutes.get('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const badges = toBadgeListView(await listBadges(userId));
  return ok(c, { badges, total: badges.length });
});
