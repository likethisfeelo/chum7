/**
 * 리더 뱃지 자동 부여 로직
 *
 * 뱃지 4종:
 *   leader-debut   : 챌린지 1회 이상 완료 운영
 *   leader-active  : 완주율 50% 이상 챌린지 3회 이상 운영
 *   leader-expert  : 본인 주도 챌린지 누적 참여자 50명 이상
 *   leader-streak  : 월 1회 이상 개설 3개월 이상 연속
 *
 * 호출 시점: challenge active → completed 전환 시 (lifecycle-manager)
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { sendNotification } from './notification';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const COMPLETION_THRESHOLD = 0.5; // 완주율 50% 이상

interface LeaderChallengeSummary {
  challengeId: string;
  lifecycle: string;
  durationDays: number;
  createdAt: string;
  stats?: {
    currentParticipants?: number;
    completionCount?: number;
  };
  participantCount: number;
  completedParticipants: number;
  completionRate: number;
}

async function getLeaderChallenges(leaderId: string): Promise<LeaderChallengeSummary[]> {
  const challengesTable = process.env.CHALLENGES_TABLE!;
  const userChallengesTable = process.env.USER_CHALLENGES_TABLE!;

  // 개설자의 완료된 챌린지 목록 조회
  const result = await docClient.send(new QueryCommand({
    TableName: challengesTable,
    IndexName: 'createdBy-index',
    KeyConditionExpression: 'createdBy = :lid',
    FilterExpression: 'lifecycle = :completed',
    ExpressionAttributeValues: { ':lid': leaderId, ':completed': 'completed' },
  }));

  const challenges = result.Items ?? [];
  const summaries: LeaderChallengeSummary[] = [];

  for (const challenge of challenges) {
    // 각 챌린지의 참여자 수 + 완주자 수 조회
    const ucResult = await docClient.send(new QueryCommand({
      TableName: userChallengesTable,
      IndexName: 'challengeId-index',
      KeyConditionExpression: 'challengeId = :cid',
      FilterExpression: 'phase IN (:completed, :failed)',
      ExpressionAttributeValues: {
        ':cid': challenge.challengeId,
        ':completed': 'completed',
        ':failed': 'failed',
      },
    }));

    const participants = ucResult.Items ?? [];
    const participantCount = participants.length;
    const completedParticipants = participants.filter((uc) => uc.status === 'completed').length;
    const completionRate = participantCount > 0 ? completedParticipants / participantCount : 0;

    summaries.push({
      challengeId: challenge.challengeId,
      lifecycle: challenge.lifecycle,
      durationDays: challenge.durationDays ?? 7,
      createdAt: challenge.createdAt,
      participantCount,
      completedParticipants,
      completionRate,
    });
  }

  return summaries;
}

async function grantLeaderBadge(badgeId: string, leaderId: string, challengeId: string): Promise<boolean> {
  const badgesTable = process.env.BADGES_TABLE;
  if (!badgesTable) return false;

  const grantedAt = new Date().toISOString();
  try {
    await docClient.send(new PutCommand({
      TableName: badgesTable,
      Item: {
        badgeId,
        userId: leaderId,
        challengeId,
        grantedAt,
        createdAt: grantedAt,
        source: 'leader',
      },
      ConditionExpression: 'attribute_not_exists(badgeId) AND attribute_not_exists(userId)',
    }));
    return true;
  } catch (err: any) {
    if (err?.name !== 'ConditionalCheckFailedException') {
      console.error('[leader-badge-grant] failed', { badgeId, leaderId, err });
    }
    return false;
  }
}

/**
 * 챌린지가 completed로 전환될 때 해당 챌린지 개설자의 리더 뱃지 조건 체크
 * @returns 새로 부여된 뱃지 ID 배열
 */
export async function checkAndGrantLeaderBadges(
  leaderId: string,
  completedChallengeId: string,
): Promise<string[]> {
  if (!leaderId) return [];

  const summaries = await getLeaderChallenges(leaderId);
  // 방금 완료된 챌린지도 포함 (lifecycle-manager가 업데이트 직전이면 아직 completed 아닐 수 있음)
  const totalCompleted = summaries.length + (
    summaries.some((s) => s.challengeId === completedChallengeId) ? 0 : 1
  );

  const highQualityChallenges = summaries.filter(
    (s) => s.completionRate >= COMPLETION_THRESHOLD,
  );

  const totalParticipants = summaries.reduce((sum, s) => sum + s.participantCount, 0);

  const granted: string[] = [];

  const BADGE_NAMES: Record<string, string> = {
    'leader-debut': '리더 데뷔 🎖️',
    'leader-active': '활동 리더 🏆',
    'leader-expert': '전문 리더 👑',
    'leader-streak': '연속 리더 🔗',
  };

  // ── leader-debut: 1회 이상 완료 ────────────────────────────────────
  if (totalCompleted >= 1) {
    const ok = await grantLeaderBadge('leader-debut', leaderId, completedChallengeId);
    if (ok) granted.push('leader-debut');
  }

  // ── leader-active: 완주율 50%+ 챌린지 3회 이상 ────────────────────
  if (highQualityChallenges.length >= 3) {
    const ok = await grantLeaderBadge('leader-active', leaderId, completedChallengeId);
    if (ok) granted.push('leader-active');
  }

  // ── leader-expert: 누적 참여자 50명 이상 ──────────────────────────
  if (totalParticipants >= 50) {
    const ok = await grantLeaderBadge('leader-expert', leaderId, completedChallengeId);
    if (ok) granted.push('leader-expert');
  }

  // ── leader-streak: 3개월 이상 연속 월 1회 이상 개설 ───────────────
  if (hasMonthlyStreak(summaries, 3)) {
    const ok = await grantLeaderBadge('leader-streak', leaderId, completedChallengeId);
    if (ok) granted.push('leader-streak');
  }

  // 새로 부여된 뱃지 알림 발송
  for (const badgeId of granted) {
    sendNotification({
      recipientId: leaderId,
      type: 'feed_leader_badge_updated',
      title: '리더 뱃지를 획득했어요!',
      body: `${BADGE_NAMES[badgeId] ?? badgeId} 뱃지가 개인 피드 업적 탭에 추가됐어요`,
      relatedId: completedChallengeId,
      relatedType: 'challenge',
      deepLink: '/personal-feed/me?tab=achievements',
    }).catch(() => {});
  }

  return granted;
}

/**
 * N개월 이상 연속 월 1회 이상 챌린지 개설 여부 확인
 */
function hasMonthlyStreak(summaries: LeaderChallengeSummary[], minMonths: number): boolean {
  if (summaries.length < minMonths) return false;

  // 개설 월(YYYY-MM) 집합
  const months = new Set(
    summaries.map((s) => s.createdAt.slice(0, 7)),
  );

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
