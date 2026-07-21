import { Hono } from 'hono';
import { AppEnv, fail, ok } from '@chum7/api-kit';
import { pushSubscriptionSchema } from '../schemas';
import { pushEndpointId } from '../domain/push';
import { deletePushSubscription, putPushSubscription } from '../repo/push-repo';

/**
 * /u/push-subscriptions — Web Push 구독 등록/해제 (신규 표면, 레거시 없음).
 * users 테이블 sk=`PUSH#<sha256(endpoint) 앞 16 hex>`.
 */
export const pushRoutes = new Hono<AppEnv>();

// POST /u/push-subscriptions — 구독 등록 (동일 endpoint 재등록은 upsert)
pushRoutes.post('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = await c.req.json().catch(() => ({}));
  const input = pushSubscriptionSchema.parse(body);

  const endpointId = pushEndpointId(input.endpoint);
  await putPushSubscription(userId, endpointId, input, new Date().toISOString());

  return ok(c, { endpointId }, '푸시 구독이 등록되었습니다', 201);
});

// DELETE /u/push-subscriptions — 구독 해제 (endpoint는 바디 또는 쿼리로)
pushRoutes.delete('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = (await c.req.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = body.endpoint ?? c.req.query('endpoint');

  if (!endpoint) {
    return fail(c, 400, 'MISSING_ENDPOINT', '해제할 구독 endpoint가 필요합니다');
  }

  await deletePushSubscription(userId, pushEndpointId(endpoint));
  return ok(c);
});
