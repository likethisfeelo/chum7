import webpush from 'web-push';
import { DeleteCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { docClient, tableName } from '@chum7/api-kit';
import type { NotificationSettings, PushPayload } from './domain/push-rules';
import type { RecentNotificationItem } from './domain/bundle-rules';

/**
 * Web Push 실발송 (PRODUCT_SPEC §4.10).
 *  - VAPID: env VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY 우선, 없으면 SecretsManager
 *    (VAPID_SECRET_NAME, JSON {publicKey,privateKey}) — 모듈 캐시.
 *  - 구독: users 테이블 pk=USER#<id>, sk begins_with PUSH# (user-api push-repo와 동일 키).
 *  - 410/404 응답 구독은 삭제, 구독별 오류는 격리 (인앱 기록은 이미 완료 상태).
 */

const TABLE = 'USERS_TABLE';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cachedVapid: Promise<VapidKeys | null> | undefined;

async function fetchVapidFromSecret(): Promise<VapidKeys | null> {
  const secretName = process.env.VAPID_SECRET_NAME;
  if (!secretName) return null;
  const client = new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (!res.SecretString) return null;
  const parsed = JSON.parse(res.SecretString) as Partial<VapidKeys>;
  if (!parsed.publicKey || !parsed.privateKey) return null;
  return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
}

/** VAPID 키 로드 — env → SecretsManager 순, 실패 시 null (모듈 수명 동안 캐시) */
export function loadVapidKeys(): Promise<VapidKeys | null> {
  if (!cachedVapid) {
    cachedVapid = (async () => {
      const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
      if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        return { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY };
      }
      try {
        return await fetchVapidFromSecret();
      } catch (err) {
        console.log(
          JSON.stringify({
            level: 'warn',
            message: 'vapid secret load failed',
            error: (err as Error).message,
          }),
        );
        return null;
      }
    })();
    // 실패 결과는 캐시하지 않는다 (다음 호출에서 재시도)
    cachedVapid = cachedVapid.then((keys) => {
      if (!keys) cachedVapid = undefined;
      return keys;
    });
  }
  return cachedVapid;
}

/** 테스트 전용 — 캐시 초기화 */
export function resetVapidCacheForTest(): void {
  cachedVapid = undefined;
}

interface PushSubscriptionItem {
  sk: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function loadPushSubscriptions(userId: string): Promise<PushSubscriptionItem[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PUSH#' },
    }),
  );
  return (res.Items ?? []).filter(
    (item): item is PushSubscriptionItem =>
      typeof item.endpoint === 'string' && !!item.keys?.p256dh && !!item.keys?.auth,
  );
}

export async function loadNotificationSettings(
  userId: string,
): Promise<NotificationSettings | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${userId}`, sk: 'SETTINGS#notifications' },
    }),
  );
  return res.Item?.settings as NotificationSettings | undefined;
}

/**
 * 최근 인앱 알림 조회 (묶음 발송·폭주 가드용 — §4.10 집계).
 * sk 내림차순(최신순) 최대 15건 — 별도 GSI 없이 단일 Query.
 * 방금 기록한 알림(excludeSk)은 제외하고, 미읽음·카테고리·윈도우 필터는 코드에서 수행한다.
 */
export async function loadRecentNotifications(
  userId: string,
  excludeSk: string,
): Promise<RecentNotificationItem[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'NOTIF#' },
      ScanIndexForward: false,
      Limit: 15,
    }),
  );
  return (res.Items ?? []).filter((item) => item.sk !== excludeSk) as RecentNotificationItem[];
}

async function deleteStaleSubscription(userId: string, sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${userId}`, sk },
    }),
  );
}

/**
 * 수신자의 모든 구독 기기로 발송. 구독별 오류는 격리하고
 * 410 Gone / 404 Not Found 는 만료 구독으로 보고 삭제한다.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const vapid = await loadVapidKeys();
  if (!vapid) {
    console.log(
      JSON.stringify({ level: 'warn', message: 'vapid keys unavailable, push skipped', userId }),
    );
    return;
  }

  const subscriptions = await loadPushSubscriptions(userId);
  if (subscriptions.length === 0) return;

  const subject = process.env.VAPID_SUBJECT ?? 'https://www.chum7.com';
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body,
          { vapidDetails: { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey } },
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deleteStaleSubscription(userId, sub.sk).catch(() => undefined);
          console.log(
            JSON.stringify({ level: 'info', message: 'stale push subscription removed', userId, statusCode }),
          );
          return;
        }
        console.log(
          JSON.stringify({
            level: 'warn',
            message: 'push send failed',
            userId,
            statusCode,
            error: (err as Error).message,
          }),
        );
      }
    }),
  );
}
