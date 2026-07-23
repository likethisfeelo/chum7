/**
 * 친구 모델 v2 — 순수 판정 로직 (라우트에서 분리해 단위 테스트 대상으로).
 * DB·IO 없음. 라우트(routes/friends.ts)는 이 결정을 그대로 실행만 한다.
 *
 * 세계관: 접점이 양방향으로 임계값(기본 100, 각 방향)을 넘겨야 친구 신청 자격이
 * 생기고, 양쪽이 서로 신청하면 수락 단계 없이 자동으로 친구가 된다.
 */

export interface PairStatLike {
  outCount?: number; // 내가 상대에게 한 상호작용 누계
  inCount?: number; // 상대가 나에게 한 상호작용 누계
  sharedChallengeCount?: number;
  [k: string]: unknown;
}

export interface FriendEdgeLike {
  status?: 'pending' | 'accepted' | 'blocked';
  direction?: 'outgoing' | 'incoming' | 'mutual';
  [k: string]: unknown;
}

/** 양방향 임계값 충족 여부 — outCount≥T && inCount≥T */
export function isEligible(stat: PairStatLike | null | undefined, threshold: number): boolean {
  if (!stat) return false;
  return Number(stat.outCount ?? 0) >= threshold && Number(stat.inCount ?? 0) >= threshold;
}

/** 쌍 키 정규화 (원장 파티션 PAIR#lo#hi) — 사전순 작은 쪽이 lo */
export function pairOrder(a: string, b: string): { lo: string; hi: string } {
  return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
}

/** 집계 → 비식별 상호작용 강도 (양방향 총량 기준). 어떤 활동이 누구였는지는 절대 노출 금지. */
export function interactionLevel(stat: PairStatLike): 'frequent' | 'regular' | 'occasional' {
  const total = Number(stat.outCount ?? 0) + Number(stat.inCount ?? 0);
  if (total >= 300) return 'frequent';
  if (total >= 150) return 'regular';
  return 'occasional';
}

export type FriendRequestDecision =
  | 'already_friends' // 이미 accepted — 409
  | 'blocked' // 차단 관계 — 409
  | 'not_eligible' // 양방향 임계값 미달 — 403
  | 'auto_friend' // 상대가 이미 나에게 신청(incoming pending) → 상호 신청 완료 → 자동 친구
  | 'first_request'; // 최초 신청 → 양쪽 pending

/**
 * 친구 신청 시 취할 동작을 결정한다. 순서가 의미를 가진다:
 * 이미 친구/차단은 자격과 무관하게 우선 단락, 그 다음 자격, 그 다음 상호신청 여부.
 */
export function decideFriendRequest(
  existing: FriendEdgeLike | null | undefined,
  stat: PairStatLike | null | undefined,
  threshold: number,
): FriendRequestDecision {
  if (existing?.status === 'accepted') return 'already_friends';
  if (existing?.status === 'blocked') return 'blocked';
  if (!isEligible(stat, threshold)) return 'not_eligible';
  if (existing?.status === 'pending' && existing.direction === 'incoming') return 'auto_friend';
  return 'first_request';
}
