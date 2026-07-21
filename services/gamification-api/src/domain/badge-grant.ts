/**
 * 뱃지 부여 판정 — 순수 로직 (AWS 무의존).
 * 이식: backend/shared/lib/badge.ts (evaluateBadgeIds) + badge-grant.ts (아이템 구성부).
 *
 * 실제 기록(조건부 Put + 알림)은 lifecycle-manager 워커가 수행한다.
 * 워커는 여기서 만든 아이템에 대해
 * `ConditionExpression: 'attribute_not_exists(pk)'` 로 중복 부여를 방지해야 한다
 * (레거시의 attribute_not_exists(badgeId) AND attribute_not_exists(userId) 대응).
 */

export type GrantBadgeInput = {
  userId: string;
  challengeId: string;
  verificationId: string;
  day: number;
  consecutiveDays: number;
  isRemedy?: boolean;
};

export type GrantSpecificBadgeInput = {
  badgeId: string;
  userId: string;
  challengeId: string;
  metadata?: Record<string, unknown>;
};

/** gamification 테이블 뱃지 아이템 (pk=USER#<userId>, sk=BADGE#<badgeId>) */
export interface BadgeItem {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  badgeId: string;
  userId: string;
  challengeId: string;
  grantedAt: string;
  createdAt: string;
  verificationId?: string;
  sourceDay?: number;
  sourceConsecutiveDays?: number;
  [key: string]: unknown;
}

/** 인증 제출 시 부여할 뱃지 ID 판정 (레거시 evaluateBadgeIds 그대로) */
export function evaluateBadgeIds(input: {
  day: number;
  consecutiveDays: number;
  isRemedy?: boolean;
}): string[] {
  if (input.isRemedy) return [];

  const newBadges: string[] = [];
  if (input.consecutiveDays === 3) {
    newBadges.push('3-day-streak');
  }
  if (input.day === 7 && input.consecutiveDays === 7) {
    newBadges.push('7-day-master');
  }

  return newBadges;
}

function baseKeys(userId: string, badgeId: string, grantedAt: string) {
  return {
    pk: `USER#${userId}`,
    sk: `BADGE#${badgeId}`,
    gsi1pk: `BADGE#${badgeId}`,
    gsi1sk: grantedAt,
  };
}

/** 인증 기반 뱃지 부여 아이템 목록 (레거시 grantBadges의 Put Item 구성 대응) */
export function buildBadgeGrantItems(input: GrantBadgeInput, now: Date): BadgeItem[] {
  const grantedAt = now.toISOString();
  return evaluateBadgeIds(input).map((badgeId) => ({
    ...baseKeys(input.userId, badgeId, grantedAt),
    badgeId,
    userId: input.userId,
    challengeId: input.challengeId,
    verificationId: input.verificationId,
    grantedAt,
    sourceDay: input.day,
    sourceConsecutiveDays: input.consecutiveDays,
    createdAt: grantedAt,
  }));
}

/** 특정 뱃지 직접 부여 아이템 (레거시 grantSpecificBadge 대응 — 리더 뱃지 등) */
export function buildSpecificBadgeItem(input: GrantSpecificBadgeInput, now: Date): BadgeItem {
  const grantedAt = now.toISOString();
  return {
    ...baseKeys(input.userId, input.badgeId, grantedAt),
    badgeId: input.badgeId,
    userId: input.userId,
    challengeId: input.challengeId,
    grantedAt,
    createdAt: grantedAt,
    ...(input.metadata ?? {}),
  };
}
