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

export const DEFAULT_SETTINGS: Record<string, boolean> = {
  category_challenge: true,
  category_quest: true,
  category_cheer: true,
  category_feed_social: true,
  category_feed_badge: true,
  category_bulletin: true,
  category_challenge_board: true,
  category_plaza: true,
};

/** 요청 바디에서 허용된 boolean 설정 키만 추출 (레거시 PUT 검증 규칙 그대로) */
export function pickSettingUpdates(body: Record<string, unknown>): Record<string, boolean> {
  const updates: Record<string, boolean> = {};
  for (const cat of VALID_CATEGORIES) {
    const key = `category_${cat}`;
    if (typeof body[key] === 'boolean') updates[key] = body[key] as boolean;
  }
  for (const t of VALID_TYPES) {
    const key = `type_${t}`;
    if (typeof body[key] === 'boolean') updates[key] = body[key] as boolean;
  }
  return updates;
}

/** 저장된 설정에 기본값 병합 (GET 응답 규칙 그대로) */
export function mergeWithDefaults(
  saved: Record<string, boolean> | undefined,
): Record<string, boolean> {
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}
