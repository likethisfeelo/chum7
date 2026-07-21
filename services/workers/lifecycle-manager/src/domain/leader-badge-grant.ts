// 사본: services/gamification-api/src/domain/leader-badge-grant.ts (서비스 간 import 금지 원칙 — 동작 변경 금지)
/**
 * 리더 뱃지 자동 부여 — 순수 판정 로직 (AWS 무의존).
 * 이식: backend/shared/lib/leader-badge-grant.ts 의 판정부.
 *
 * 뱃지 4종:
 *   leader-debut   : 챌린지 1회 이상 완료 운영
 *   leader-active  : 완주율 50% 이상 챌린지 3회 이상 운영
 *   leader-expert  : 본인 주도 챌린지 누적 참여자 50명 이상
 *   leader-streak  : 월 1회 이상 개설 3개월 이상 연속
 *
 * 호출 시점: challenge active → completed 전환 시 (lifecycle-manager 워커).
 * 데이터 수집(리더의 챌린지·참여자 집계)과 조건부 Put(중복 방지)·알림 발행은 워커 책임.
 */

export const COMPLETION_THRESHOLD = 0.5; // 완주율 50% 이상

export interface LeaderChallengeSummary {
  challengeId: string;
  lifecycle: string;
  durationDays: number;
  createdAt: string;
  participantCount: number;
  completedParticipants: number;
  completionRate: number;
}

export const LEADER_BADGE_NAMES: Record<string, string> = {
  'leader-debut': '리더 데뷔 🎖️',
  'leader-active': '활동 리더 🏆',
  'leader-expert': '전문 리더 👑',
  'leader-streak': '연속 리더 🔗',
};

/**
 * 완료 전환된 챌린지의 리더가 받을 수 있는 뱃지 ID 후보 (레거시 판정 순서 유지).
 * 이미 보유한 뱃지의 중복 제거는 저장 시 조건부 Put이 담당한다.
 */
export function evaluateLeaderBadgeIds(
  summaries: LeaderChallengeSummary[],
  completedChallengeId: string,
): string[] {
  // 방금 완료된 챌린지도 포함 (lifecycle-manager가 업데이트 직전이면 아직 completed 아닐 수 있음)
  const totalCompleted =
    summaries.length + (summaries.some((s) => s.challengeId === completedChallengeId) ? 0 : 1);

  const highQualityChallenges = summaries.filter(
    (s) => s.completionRate >= COMPLETION_THRESHOLD,
  );
  const totalParticipants = summaries.reduce((sum, s) => sum + s.participantCount, 0);

  const candidates: string[] = [];
  if (totalCompleted >= 1) candidates.push('leader-debut');
  if (highQualityChallenges.length >= 3) candidates.push('leader-active');
  if (totalParticipants >= 50) candidates.push('leader-expert');
  if (hasMonthlyStreak(summaries, 3)) candidates.push('leader-streak');
  return candidates;
}

/** N개월 이상 연속 월 1회 이상 챌린지 개설 여부 확인 (레거시 그대로) */
export function hasMonthlyStreak(
  summaries: LeaderChallengeSummary[],
  minMonths: number,
): boolean {
  if (summaries.length < minMonths) return false;

  // 개설 월(YYYY-MM) 집합
  const months = new Set(summaries.map((s) => s.createdAt.slice(0, 7)));
  if (months.size < minMonths) return false;

  const sortedMonths = Array.from(months).sort();
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedMonths.length; i++) {
    const prev = new Date(sortedMonths[i - 1] + '-01');
    const curr = new Date(sortedMonths[i] + '-01');
    const diffMonths =
      (curr.getFullYear() - prev.getFullYear()) * 12 +
      (curr.getMonth() - prev.getMonth());

    if (diffMonths === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return maxStreak >= minMonths;
}

export interface NotificationIntent {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  relatedId: string;
  relatedType: string;
  deepLink?: string;
}

/** 새로 부여된 리더 뱃지 알림 페이로드 (레거시 sendNotification 호출 대응 — 발행은 워커) */
export function buildLeaderBadgeNotifications(
  grantedBadgeIds: string[],
  leaderId: string,
  completedChallengeId: string,
): NotificationIntent[] {
  return grantedBadgeIds.map((badgeId) => ({
    recipientId: leaderId,
    type: 'feed_leader_badge_updated',
    title: '리더 뱃지를 획득했어요!',
    body: `${LEADER_BADGE_NAMES[badgeId] ?? badgeId} 뱃지가 개인 피드 업적 탭에 추가됐어요`,
    relatedId: completedChallengeId,
    relatedType: 'challenge',
    deepLink: '/personal-feed/me?tab=achievements',
  }));
}
