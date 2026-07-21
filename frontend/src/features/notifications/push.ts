import { apiClient } from '@/lib/api-client';

/**
 * Web Push 구독 유틸 (PRODUCT_SPEC §4.10).
 *  - 지원 감지: serviceWorker + PushManager + Notification
 *  - iOS 미설치(홈 화면 추가 전) Safari 는 'needs-install' 로 구분 — 설치 유도 안내용
 *  - 구독: GET /public/push/key → pushManager.subscribe → POST /u/push-subscriptions
 */

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** 이 브라우저에서 푸시를 받을 수 있는지 판정 */
export function getPushSupport(): PushSupport {
  const hasApis =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (hasApis) return 'supported';
  // iOS 16.4+ 는 홈 화면 설치 후에만 Push API 가 노출된다
  if (isIos() && !isStandalone()) return 'needs-install';
  return 'unsupported';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'needs-install' | 'unsupported' | 'permission-denied' | 'error' };

/** 권한 요청 → 구독 → 서버 등록. 실패 사유를 구조화해 UI 문구 분기에 사용한다. */
export async function subscribeToPush(): Promise<SubscribeResult> {
  const support = getPushSupport();
  if (support !== 'supported') {
    return { ok: false, reason: support };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }

    const keyRes = await apiClient.get('/public/push/key');
    const publicKey: string = keyRes.data.data.publicKey;

    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'error' };
    }

    await apiClient.post('/u/push-subscriptions', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** 구독 해제 — 브라우저 구독 취소 + 서버 구독 삭제 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (getPushSupport() !== 'supported') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await apiClient.delete('/u/push-subscriptions', { data: { endpoint } });
    return true;
  } catch {
    return false;
  }
}

/** 현재 브라우저에 유효한 푸시 구독이 있는지 */
export async function isPushSubscribed(): Promise<boolean> {
  if (getPushSupport() !== 'supported') return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}
