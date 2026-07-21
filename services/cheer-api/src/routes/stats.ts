/**
 * 통계 라우트 — GET /ch/stats/my.
 * 레거시 GET /cheers/stats(materializer 버킷 + realtime 폴백) 대체: 증분 카운터 아이템 단건 조회.
 * 아이템 부재 시 전 카운터 0 응답 (신규 사용자).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok } from '@chum7/api-kit';
import { toStatsView } from '../domain/stats-rules';
import { getUserStats } from '../repo/stats';

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get('/my', async (c) => {
  const { userId } = c.get('authUser')!;
  const item = await getUserStats(userId);
  return ok(c, {
    stats: toStatsView(item),
    source: 'incremental',
    updatedAt: item?.updatedAt ?? null,
  });
});
