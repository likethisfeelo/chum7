/**
 * Web Push 발송 판단 순수 로직 (PRODUCT_SPEC §4.10).
 *  - 채널 판단: 카테고리별 푸시 토글 (설정 없으면 기본 ON)
 *  - 방해금지: settings.quietHours {start,end,enabled} — 기본 22:00~08:00 ON,
 *    단 'cheer' 카테고리는 cheerBypassQuietHours !== false 이면 예외 (기본 ON)
 *  - 딥링크: 이벤트 유형 → 실제 프론트 라우트 (frontend/src/app/App.tsx 기준)
 * 시간 판정은 Asia/Seoul 고정 (스펙 §4.10 방해금지 22–08시).
 */

export type NotificationSettings = Record<string, unknown>;

export interface QuietHours {
  start?: string; // 'HH:MM'
  end?: string; // 'HH:MM'
  enabled?: boolean;
}

export const DEFAULT_QUIET_HOURS: Required<QuietHours> = {
  start: '22:00',
  end: '08:00',
  enabled: true,
};

/** 'HH:MM' → 자정 기준 분. 형식이 틀리면 null */
export function parseHm(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** now(UTC Date) → Asia/Seoul 기준 자정 이후 경과 분 */
export function minutesOfDayInSeoul(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** 방해금지 구간 판정 — start > end 이면 자정을 넘는 구간 (예: 22:00~08:00) */
export function isWithinQuietHours(nowMinutes: number, quiet: QuietHours | undefined): boolean {
  const enabled = quiet?.enabled !== false; // 기본 ON
  if (!enabled) return false;
  const start = parseHm(quiet?.start) ?? parseHm(DEFAULT_QUIET_HOURS.start)!;
  const end = parseHm(quiet?.end) ?? parseHm(DEFAULT_QUIET_HOURS.end)!;
  if (start === end) return false; // 구간 없음
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end; // 자정 넘는 구간
}

/**
 * 카테고리 푸시 채널 ON 여부.
 * 우선순위: push_category_<cat>(채널별 토글) → category_<cat>(카테고리 전체) → 기본 ON.
 * 워커 카테고리 'social'은 설정 키 'feed_social'에 대응한다.
 */
export function isPushChannelEnabled(
  settings: NotificationSettings | undefined,
  category: string,
): boolean {
  const key = category === 'social' ? 'feed_social' : category;
  const pushToggle = settings?.[`push_category_${key}`];
  if (typeof pushToggle === 'boolean') return pushToggle;
  const categoryToggle = settings?.[`category_${key}`];
  if (typeof categoryToggle === 'boolean') return categoryToggle;
  return true; // 설정 없으면 기본 ON
}

/** 응원은 "실천 시각 도착"이 본질 — 방해금지 예외 옵션 (기본 ON) */
export function bypassesQuietHours(
  settings: NotificationSettings | undefined,
  category: string,
): boolean {
  return category === 'cheer' && settings?.cheerBypassQuietHours !== false;
}

export interface PushDecision {
  send: boolean;
  reason: 'ok' | 'channel_off' | 'quiet_hours';
}

/** 최종 발송 판단 — 채널 OFF > 방해금지(응원 예외) 순으로 걸러낸다 */
export function decidePush(input: {
  category: string;
  settings: NotificationSettings | undefined;
  now: Date;
}): PushDecision {
  const { category, settings, now } = input;
  if (!isPushChannelEnabled(settings, category)) {
    return { send: false, reason: 'channel_off' };
  }
  const quiet = (settings?.quietHours ?? undefined) as QuietHours | undefined;
  if (isWithinQuietHours(minutesOfDayInSeoul(now), quiet) && !bypassesQuietHours(settings, category)) {
    return { send: false, reason: 'quiet_hours' };
  }
  return { send: true, reason: 'ok' };
}

/** 이벤트 유형 → 딥링크 (frontend App.tsx의 실제 라우트만 사용, 없으면 '/') */
export function deepLinkFor(eventType: string): string {
  switch (eventType) {
    case 'cheer.delivered':
      return '/today'; // 받은 응원 목록이 있는 화면
    case 'comment.created':
      return '/plaza';
    case 'follow.requested':
    case 'follow.accepted':
    case 'feed.invite_link_used':
      return '/personal-feed/notifications';
    case 'order.paid':
    case 'order.rejected':
    case 'refund.completed':
    case 'settlement.ready':
    case 'shipment.updated':
      return '/my'; // 마이 탭 — 주문/배송·정산 진입점
    default:
      return '/';
  }
}

/** 푸시 페이로드 (프론트 public/push-sw.js 와의 계약) */
export interface PushPayload {
  title: string;
  body: string;
  category: string;
  deepLink: string;
}

export function buildPushPayload(input: {
  message: string;
  category: string;
  eventType: string;
}): PushPayload {
  return {
    title: 'CHME',
    body: input.message,
    category: input.category,
    deepLink: deepLinkFor(input.eventType),
  };
}
