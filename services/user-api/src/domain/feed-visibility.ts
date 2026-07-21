/**
 * 개인 피드 공개 레이어(L0~L4) 판정 — 레거시 backend/services/personal-feed/{profile,posts}
 * 의 순수 로직을 그대로 이식 (동작 변경 금지).
 *
 * L0: 기본 (최소 정보만)
 * L1: feedSettings.isPublic = true → Tab 03 열람 가능
 * L2: 팔로우 요청 가능 (초대 링크 접속자 or 공통 챌린지 10회 완주 조건 충족)
 * L3: followStatus = 'accepted' → Tab 01 열람 가능
 * L4: isMutual OR feedSettings.tab02Public = true → Tab 02·04 열람 가능
 * -1: 차단됨
 */
export type FollowStatus = 'none' | 'pending' | 'accepted';

export interface LayerInput {
  isOwn: boolean;
  isPublic: boolean;
  tab02Public: boolean;
  followStatus: FollowStatus;
  isMutual: boolean;
  isBlocked: boolean;
  hasSharedChallengeEligibility: boolean;
}

export function resolveLayer(params: LayerInput): number {
  if (params.isOwn) return 4;
  if (params.isBlocked) return -1;
  if (params.followStatus === 'accepted') {
    if (params.isMutual || params.tab02Public) return 4;
    return 3;
  }
  // L2: 공통 챌린지 10회 완주 조건 충족 시 팔로우 버튼 노출
  if (params.hasSharedChallengeEligibility) return 2;
  if (params.isPublic) return 1;
  return 0;
}

/**
 * 자유글 visibility 접근 판정 (레거시 personal-feed/posts).
 *   private   → 본인만 (layer 4)
 *   followers → 팔로워 이상 (layer 3+)
 *   mutual    → 맞팔 이상 (layer 4)
 */
export function visibilityAccessible(visibility: string, layer: number): boolean {
  if (visibility === 'private') return layer >= 4;
  if (visibility === 'mutual') return layer >= 4;
  if (visibility === 'followers') return layer >= 3;
  return false;
}

/** 자유글 목록 조회용 간이 레이어 (레거시 posts 핸들러의 축약 판정 그대로) */
export function layerForPosts(
  isOwn: boolean,
  forwardAccepted: boolean,
  reverseAccepted: boolean,
): number {
  if (isOwn) return 4;
  if (forwardAccepted && reverseAccepted) return 4;
  if (forwardAccepted) return 3;
  return 0;
}

/** 레거시 followId 계약: `<followerId>#<followeeId>` */
export function makeFollowId(followerId: string, followeeId: string): string {
  return `${followerId}#${followeeId}`;
}

export function parseFollowId(
  followId: string,
): { followerId: string; followeeId: string } | null {
  const idx = followId.indexOf('#');
  if (idx <= 0 || idx >= followId.length - 1) return null;
  return { followerId: followId.slice(0, idx), followeeId: followId.slice(idx + 1) };
}

/** graph 테이블 분리 저장(FOLLOWER/FOLLOWREQ) → 레거시 status 문자열 복원 */
export function deriveFollowStatus(hasFollow: boolean, hasPendingRequest: boolean): FollowStatus {
  if (hasFollow) return 'accepted';
  if (hasPendingRequest) return 'pending';
  return 'none';
}
