/**
 * 알림 설정 순수 로직 — 레거시 backend/services/notifications/settings 의
 * 카테고리/타입 화이트리스트·기본값·병합 규칙을 그대로 이식.
 */

// 허용된 카테고리 키
export const VALID_CATEGORIES = [
  'challenge', 'quest', 'cheer',
  'feed_social', 'feed_badge',
  'bulletin', 'challenge_board', 'plaza',
] as const;

// 허용된 타입 키 (세부 제어)
export const VALID_TYPES = [
  'challenge_completed', 'challenge_failed', 'challenge_preparing',
  'challenge_start_confirmation_required', 'challenge_start_delayed',
  'join_request_auto_rejected', 'join_requests_auto_rejected',
  'join_request_approved', 'join_request_rejected',
  'quest_submission_approved', 'quest_submission_rejected',
  'quest_proposal_expired', 'new_quest_available',
  'cheer_received',
  'bulletin_comment', 'challenge_comment', 'plaza_comment',
  'feed_follow_request', 'feed_follow_accepted', 'feed_invite_link_used',
  'feed_badge_granted', 'feed_leader_badge_updated',
] as const;

export type NotificationSettingValue = boolean | QuietHours;

export interface QuietHours {
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  enabled: boolean;
}

/** 방해금지 기본값 — 22~08시 ON, 응원은 예외 기본 ON (PRODUCT_SPEC §4.10) */
export const DEFAULT_QUIET_HOURS: QuietHours = { start: '22:00', end: '08:00', enabled: true };

export const DEFAULT_SETTINGS: Record<string, NotificationSettingValue> = {
  category_challenge: true,
  category_quest: true,
  category_cheer: true,
  category_feed_social: true,
  category_feed_badge: true,
  category_bulletin: true,
  category_challenge_board: true,
  category_plaza: true,
  quietHours: DEFAULT_QUIET_HOURS,
  cheerBypassQuietHours: true,
};

const HM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** quietHours 바디 값 검증 — {start:'HH:MM', end:'HH:MM', enabled:boolean} 만 허용 */
export function parseQuietHours(value: unknown): QuietHours | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.start !== 'string' || !HM_RE.test(v.start)) return null;
  if (typeof v.end !== 'string' || !HM_RE.test(v.end)) return null;
  if (typeof v.enabled !== 'boolean') return null;
  return { start: v.start, end: v.end, enabled: v.enabled };
}

/** 요청 바디에서 허용된 설정 키만 추출 (레거시 PUT 검증 규칙 + 푸시 확장 키) */
export function pickSettingUpdates(
  body: Record<string, unknown>,
): Record<string, NotificationSettingValue> {
  const updates: Record<string, NotificationSettingValue> = {};
  for (const cat of VALID_CATEGORIES) {
    const key = `category_${cat}`;
    if (typeof body[key] === 'boolean') updates[key] = body[key] as boolean;
  }
  for (const t of VALID_TYPES) {
    const key = `type_${t}`;
    if (typeof body[key] === 'boolean') updates[key] = body[key] as boolean;
  }
  // 푸시 확장 (PRODUCT_SPEC §4.10): 카테고리별 푸시 채널 토글 / 방해금지 / 응원 예외
  for (const cat of VALID_CATEGORIES) {
    const key = `push_category_${cat}`;
    if (typeof body[key] === 'boolean') updates[key] = body[key] as boolean;
  }
  if (typeof body.cheerBypassQuietHours === 'boolean') {
    updates.cheerBypassQuietHours = body.cheerBypassQuietHours;
  }
  const quietHours = parseQuietHours(body.quietHours);
  if (quietHours) updates.quietHours = quietHours;
  return updates;
}

/** 저장된 설정에 기본값 병합 (GET 응답 규칙 그대로) */
export function mergeWithDefaults(
  saved: Record<string, NotificationSettingValue> | undefined,
): Record<string, NotificationSettingValue> {
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}
