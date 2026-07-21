/**
 * 묶음 발송(집계) 순수 로직 (PRODUCT_SPEC §4.10 집계 행).
 * "같은 게시물 다중 리액션은 묶음 발송 ('OO 외 3명이 반응'), 폭주 방지"
 *
 * 규칙:
 *  - 묶음 후보: 같은 카테고리 + 같은 이벤트 유형 + 미읽음 + BUNDLE_WINDOW_MINUTES(30분) 이내,
 *    'social' 카테고리는 같은 대상(detail.targetId, 있을 때)만 묶는다.
 *  - 응원(cheer)은 절대 묶지 않는다 — 응원 한 건 한 건이 그 자체로 의미.
 *  - 태그: `<category>:<targetId||'general'>` — SW 가 같은 묶음의 이전 알림을 교체(폭주 방지).
 *  - 폭주 가드: 윈도우 내 알림이 MAX_PUSHES_PER_WINDOW(5건) 이상이면 비-cheer 푸시 억제.
 */

export const BUNDLE_WINDOW_MINUTES = 30;
export const MAX_PUSHES_PER_WINDOW = 5;

const WINDOW_MS = BUNDLE_WINDOW_MINUTES * 60_000;

/** DynamoDB에서 읽은 최근 알림 아이템 (형태 보장 없음 — 느슨한 타입) */
export interface RecentNotificationItem {
  category?: unknown;
  eventType?: unknown;
  isRead?: unknown;
  createdAt?: unknown;
  detail?: Record<string, unknown>;
}

/** createdAt(ISO)이 now 기준 윈도우(30분) 이내인가 — 경계(정확히 30분)는 포함 */
export function isWithinBundleWindow(createdAt: unknown, now: Date): boolean {
  if (typeof createdAt !== 'string') return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= WINDOW_MS;
}

/** 묶음 그룹의 안정 태그 — SW 가 같은 태그의 이전 알림을 교체한다 */
export function bundleTag(category: string, detail: Record<string, unknown> | undefined): string {
  const targetId = detail?.targetId;
  const target = typeof targetId === 'string' && targetId.length > 0 ? targetId : 'general';
  return `${category}:${target}`;
}

/** 리액션류 이벤트인가 — 계약에 아직 없는 유형도 전방 호환으로 처리 */
export function isReactionEvent(eventType: string): boolean {
  return eventType.startsWith('reaction.') || eventType === 'like.created';
}

/** detail 에서 보낸 사람 표시명 추출 (없으면 undefined → 건수 기반 문구) */
export function senderNameOf(detail: Record<string, unknown> | undefined): string | undefined {
  for (const key of ['senderName', 'authorName', 'userName']) {
    const value = detail?.[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** 이벤트 유형별 묶음 문구 (기존 라우팅 문구와 톤 일치) */
export function bundledBody(input: {
  eventType: string;
  count: number;
  senderName?: string;
}): string {
  const { eventType, count, senderName } = input;
  if (isReactionEvent(eventType)) {
    if (senderName) return `${senderName} 외 ${count - 1}명이 반응했어요`;
    return `내 게시물에 반응이 ${count}건 달렸어요`;
  }
  switch (eventType) {
    case 'comment.created':
      return `내 게시물에 새 댓글이 ${count}건 달렸어요`;
    case 'follow.requested':
      return `새 팔로우 요청이 ${count}건 있어요`;
    case 'feed.invite_link_used':
      return `초대 링크로 새 이웃이 ${count}명 들어왔어요`;
    default:
      return `새 알림이 ${count}건 있어요`;
  }
}

/** 새 알림과 같은 묶음 그룹에 속하는 최근(미읽음·윈도우 내) 알림들 */
export function collectBundleGroup(input: {
  category: string;
  eventType: string;
  detail: Record<string, unknown>;
  recent: RecentNotificationItem[];
  now: Date;
}): RecentNotificationItem[] {
  const { category, eventType, detail, recent, now } = input;
  const targetId = typeof detail.targetId === 'string' ? detail.targetId : undefined;
  return recent.filter((item) => {
    if (item.isRead !== false) return false;
    if (item.category !== category) return false;
    if (item.eventType !== eventType) return false;
    if (!isWithinBundleWindow(item.createdAt, now)) return false;
    if (category === 'social' && targetId !== undefined) {
      return item.detail?.targetId === targetId;
    }
    return true;
  });
}

export interface BundleDecision {
  /** 푸시 본문 — 묶이면 집계 문구, 아니면 원래 문구 */
  body: string;
  bundled: boolean;
  /** 묶음에 포함된 알림 수 (새 알림 포함) */
  count: number;
  /** SW notification tag — 같은 묶음은 이전 알림을 교체 */
  tag: string;
  /** 묶음 갱신은 재알림 없이 조용히 교체 */
  renotify?: boolean;
}

/**
 * 묶음 판단 — 같은 그룹의 미읽음 알림이 1건 이상 있으면 집계 문구로 교체.
 * cheer 는 항상 단건 (묶지 않음).
 */
export function decideBundle(input: {
  category: string;
  eventType: string;
  message: string;
  detail: Record<string, unknown>;
  recent: RecentNotificationItem[];
  now: Date;
}): BundleDecision {
  const { category, eventType, message, detail, recent, now } = input;
  const tag = bundleTag(category, detail);
  if (category === 'cheer') {
    return { body: message, bundled: false, count: 1, tag };
  }
  const group = collectBundleGroup({ category, eventType, detail, recent, now });
  const count = group.length + 1; // 새 알림 포함
  if (count < 2) {
    return { body: message, bundled: false, count: 1, tag };
  }
  const senderName =
    senderNameOf(detail) ?? group.map((item) => senderNameOf(item.detail)).find(Boolean);
  return {
    body: bundledBody({ eventType, count, senderName }),
    bundled: true,
    count,
    tag,
    renotify: false,
  };
}

/**
 * 폭주 가드 — 윈도우 내 이미 MAX_PUSHES_PER_WINDOW(5건) 이상이면
 * 이번 푸시(6건째~)는 억제. cheer 는 억제 대상이 아니다 (인앱 기록은 영향 없음).
 */
export function isPushRateLimited(input: {
  category: string;
  recent: RecentNotificationItem[];
  now: Date;
}): boolean {
  const { category, recent, now } = input;
  if (category === 'cheer') return false;
  const inWindow = recent.filter((item) => isWithinBundleWindow(item.createdAt, now)).length;
  return inWindow >= MAX_PUSHES_PER_WINDOW;
}
