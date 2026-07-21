/**
 * 마당(plaza) 뷰 순수 로직 — 레거시 backend/services/plaza/{feed,comments} 이식.
 * 노출 점수·필터→postType 매핑·응답 sanitize·댓글 동물 아이콘. AWS 무의존.
 */

export type PlazaFilter = 'all' | 'recruiting' | 'in_progress' | 'completed';

/** 마당 게시물 타입 (레거시 승계): courtyard=인증 변환글, recruitment=모집글,
 *  progress_update=진행소식, badge_review=뱃지후기 */
export const PLAZA_POST_TYPES = ['courtyard', 'recruitment', 'progress_update', 'badge_review'] as const;
export type PlazaPostType = (typeof PLAZA_POST_TYPES)[number];

/** 사용자가 직접 작성 가능한 타입 (courtyard는 plaza-converter 워커 전용) */
export const USER_CREATABLE_POST_TYPES = ['recruitment', 'progress_update', 'badge_review'] as const;

export function normalizeFilter(rawFilter?: string): PlazaFilter {
  if (rawFilter === 'recruiting' || rawFilter === 'in_progress' || rawFilter === 'completed' || rawFilter === 'all') {
    return rawFilter;
  }
  return 'all';
}

export function toPostTypes(filter: PlazaFilter): string[] {
  if (filter === 'recruiting') return ['recruitment'];
  if (filter === 'in_progress') return ['progress_update'];
  if (filter === 'completed') return ['courtyard', 'badge_review'];
  return ['courtyard', 'recruitment', 'progress_update', 'badge_review'];
}

/** all 필터 정렬용 노출 점수 (레거시 exposureScore 그대로) */
export function exposureScore(post: any, nowMs: number): number {
  const createdMs = new Date(post.createdAt || 0).getTime();
  const ageHours = Math.max(0, (nowMs - createdMs) / (1000 * 60 * 60));
  const freshness = Math.max(0, 100 - ageHours * 8);
  const reaction = (post.likeCount || 0) * 1 + (post.commentCount || 0) * 2 + (post.bookmarkCount || 0) * 1.5;
  const typeWeight = post.postType === 'recruitment' && (post.remainingSlots || 0) > 0 ? 1.3 : 1;
  return (freshness + reaction) * typeWeight;
}

/**
 * 응답 sanitize — 내부 소스 필드 제거 + challengeId/leaderId 폴백 (레거시 sanitizePost).
 * 이미지 서명은 repo/media에서 수행하므로 여기서는 필드 정리만.
 */
export function sanitizePost(post: Record<string, any>): Record<string, any> {
  const {
    sourceUserId,
    sourceId,
    sourceType,
    sourceChallengeId,
    sourceLeaderId,
    exposureScore: _ignored,
    _score,
    ...safe
  } = post;
  return {
    ...safe,
    challengeId: safe.challengeId || sourceChallengeId || null,
    leaderId: safe.leaderId || sourceLeaderId || null,
  };
}

/** 마당 댓글 동물 아이콘 (레거시 plaza/comments toAnimalIcon) */
export const COMMENT_ANIMALS = ['🐰', '🐻', '🦊', '🐼', '🦁', '🐯', '🐨', '🦦'];

export function toAnimalIcon(seed: string): string {
  const sum = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return COMMENT_ANIMALS[sum % COMMENT_ANIMALS.length]!;
}

/** 해시태그 레지스트리 최초 등록자 아이콘 (레거시 verification/submit 승계 — userId 시드) */
export function toCreatorAnimalIcon(userId: string): string {
  return toAnimalIcon(userId);
}
