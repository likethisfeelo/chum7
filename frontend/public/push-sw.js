/* eslint-disable no-restricted-globals */
/**
 * Web Push 핸들러 (PRODUCT_SPEC §4.10) — 서비스워커(generateSW)의 importScripts 로 로드된다.
 * 페이로드 계약: notification-worker 가 보내는 JSON
 *   { title: 'CHME', body: string, category: string, deepLink: string,
 *     tag?: string, renotify?: boolean }  — tag/renotify 는 묶음 발송(§4.10 집계)용
 * 딥링크: 클릭 시 해당 화면으로 직행 (열린 탭이 있으면 focus + 이동, 없으면 새 창).
 */

self.addEventListener('push', (event) => {
  let payload = { title: 'CHME', body: '새 알림이 도착했어요', category: 'general', deepLink: '/' };
  try {
    if (event.data) {
      payload = Object.assign(payload, event.data.json());
    }
  } catch (e) {
    // JSON 이 아니면 텍스트를 본문으로
    try {
      payload.body = event.data.text();
    } catch (_) {
      /* noop */
    }
  }

  const options = {
    body: payload.body,
    icon: '/icons/icon-512.png',
    badge: '/icons/icon-512.png',
    // 묶음 태그(<category>:<targetId>)가 있으면 같은 묶음의 이전 알림을 교체,
    // 없으면 기존처럼 카테고리 단위로 교체 (폭주 방지)
    tag: payload.tag || payload.category,
    data: { deepLink: payload.deepLink || '/' },
  };
  if (typeof payload.renotify === 'boolean') {
    options.renotify = payload.renotify; // 묶음 갱신은 false — 소리/진동 없이 조용히 교체
  }

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const deepLink = (event.notification.data && event.notification.data.deepLink) || '/';
  const targetUrl = new URL(deepLink, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            // 이미 열린 앱 탭이 있으면 focus 후 딥링크로 이동
            if ('navigate' in client && client.url !== targetUrl) {
              return client.navigate(targetUrl).then((c) => (c ? c.focus() : client.focus()));
            }
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
