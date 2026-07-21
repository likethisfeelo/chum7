import { Hono } from 'hono';
import { AppEnv, ok } from '@chum7/api-kit';
import { kstDateString, aggregateWorldSummary } from '../domain/world-summary';
import { listTodayPublicVerifications } from '../repo/verifications-readonly';

export const todayRoutes = new Hono<AppEnv>();

// GET /public/today/world-summary  (레거시 GET /today/world-summary — { layers, totals } 계약 유지)
todayRoutes.get('/world-summary', async (c) => {
  const now = new Date(); // 핸들러 진입 시 1회 캡처
  const verifications = await listTodayPublicVerifications(kstDateString(now));
  return ok(c, aggregateWorldSummary(verifications));
});
