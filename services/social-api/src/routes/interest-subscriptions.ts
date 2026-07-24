/**
 * 관심영역(리더+카테고리) 구독 — /s/interest-subscriptions
 *  GET    /            내 구독 목록
 *  PATCH  /            on/off  (body: { leaderId, category, enabled })
 *  DELETE /?leaderId=&category=   구독 삭제
 * 생성은 마당 좋아요 시 자동(plaza react) — 여기서는 조회·끄기·삭제만 제공.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import {
  deleteSubscription,
  listMySubscriptions,
  setSubscriptionEnabled,
} from '../repo/interest-subscriptions';
import { categoryLabel } from '../domain/interest-area';

export const interestSubscriptionRoutes = new Hono<AppEnv>();

const toggleSchema = z.object({
  leaderId: z.string().min(1),
  category: z.string().min(1),
  enabled: z.boolean(),
});

function toView(item: Record<string, any>) {
  return {
    leaderId: item.leaderId,
    category: item.category,
    categoryLabel: categoryLabel(String(item.category ?? '')),
    name: item.name ?? categoryLabel(String(item.category ?? '')),
    enabled: item.enabled !== false,
    count: Number(item.count ?? 0),
    sampleChallengeId: item.sampleChallengeId ?? null,
    sampleChallengeTitle: item.sampleChallengeTitle ?? null,
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
  };
}

interestSubscriptionRoutes.get('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const items = await listMySubscriptions(userId);
  const subscriptions = items
    .map(toView)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return ok(c, { subscriptions, total: subscriptions.length });
});

interestSubscriptionRoutes.patch('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = toggleSchema.parse(await c.req.json().catch(() => ({})));
  const applied = await setSubscriptionEnabled(
    userId,
    input.leaderId,
    input.category,
    input.enabled,
    new Date().toISOString(),
  );
  if (!applied) return fail(c, 404, 'SUBSCRIPTION_NOT_FOUND', '구독을 찾을 수 없습니다');
  return ok(c, { leaderId: input.leaderId, category: input.category, enabled: input.enabled });
});

interestSubscriptionRoutes.delete('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const leaderId = (c.req.query('leaderId') ?? '').trim();
  const category = (c.req.query('category') ?? '').trim();
  if (!leaderId || !category) {
    return fail(c, 400, 'MISSING_PARAMS', 'leaderId·category가 필요합니다');
  }
  await deleteSubscription(userId, leaderId, category);
  return ok(c, { deleted: true });
});
