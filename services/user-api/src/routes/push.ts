import { Hono } from 'hono';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { ApiContext, AppEnv, fail, ok } from '@chum7/api-kit';
import { pushSubscriptionSchema } from '../schemas';
import { pushEndpointId } from '../domain/push';
import { deletePushSubscription, putPushSubscription } from '../repo/push-repo';

/**
 * /u/push-subscriptions — Web Push 구독 등록/해제 (신규 표면, 레거시 없음).
 * users 테이블 sk=`PUSH#<sha256(endpoint) 앞 16 hex>`.
 * + GET /public/push/key — VAPID 공개키 (프론트 pushManager.subscribe 용, index.ts에서 등록).
 */
export const pushRoutes = new Hono<AppEnv>();

let cachedPublicKey: Promise<string | null> | undefined;

/** VAPID 공개키 — env VAPID_PUBLIC_KEY 우선, 없으면 SecretsManager(VAPID_SECRET_NAME) 캐시 조회 */
function loadVapidPublicKey(): Promise<string | null> {
  if (!cachedPublicKey) {
    cachedPublicKey = (async () => {
      if (process.env.VAPID_PUBLIC_KEY) return process.env.VAPID_PUBLIC_KEY;
      const secretName = process.env.VAPID_SECRET_NAME;
      if (!secretName) return null;
      try {
        const client = new SecretsManagerClient({});
        const res = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
        const parsed = JSON.parse(res.SecretString ?? '{}') as { publicKey?: string };
        return parsed.publicKey ?? null;
      } catch {
        return null;
      }
    })().then((key) => {
      if (!key) cachedPublicKey = undefined; // 실패는 캐시하지 않음
      return key;
    });
  }
  return cachedPublicKey;
}

// GET /public/push/key — 퍼블릭 (구독 전 권한 요청 화면에서 필요)
export async function getPublicPushKey(c: ApiContext) {
  const publicKey = await loadVapidPublicKey();
  if (!publicKey) {
    return fail(c, 503, 'PUSH_KEY_UNAVAILABLE', '푸시 키가 아직 설정되지 않았습니다');
  }
  return ok(c, { publicKey });
}

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
