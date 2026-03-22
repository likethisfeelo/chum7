// backend/services/challenge/join/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { resolveJoinRequirements } from '../../../shared/lib/join-requirements';
import { certDateFromIso, DEFAULT_TIMEZONE } from '../../../shared/lib/challenge-quest-policy';
import { docClient } from '../../../shared/lib/dynamodb-client';
import { response } from '../../../shared/lib/api-response';

const personalTargetSchema = z.object({
  hour12: z.number().int().min(1).max(12),
  minute: z.number().int().min(0).max(59),
  meridiem: z.enum(['AM', 'PM']),
  timezone: z.string().min(1).max(100).default('Asia/Seoul'),
});

const joinSchema = z.object({
  personalGoal: z.string().max(200).optional(),
  personalTarget: personalTargetSchema.optional(),
});


function to24Hour(hour12: number, meridiem: 'AM' | 'PM'): number {
  if (meridiem === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function toTime24(hour12: number, minute: number, meridiem: 'AM' | 'PM'): string {
  const hh = String(to24Hour(hour12, meridiem)).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${hh}:${mm}`;
}


const KST_MS = 9 * 60 * 60 * 1000;
function getProposalDeadline(challengeStartAt?: string): string | null {
  if (!challengeStartAt) return null;
  const start = new Date(challengeStartAt);
  if (Number.isNaN(start.getTime())) return null;
  // challengeStartAt을 KST로 변환하여 D-1 23:59 KST를 계산한 뒤 UTC로 반환
  const kst = new Date(start.getTime() + KST_MS);
  kst.setUTCDate(kst.getUTCDate() - 1);
  kst.setUTCHours(23, 59, 0, 0);
  return new Date(kst.getTime() - KST_MS).toISOString();
}


export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }
    if (!challengeId) {
      return response(400, { error: 'MISSING_CHALLENGE_ID', message: '챌린지 ID가 필요합니다' });
    }

    const body = JSON.parse(event.body || '{}');
    const input = joinSchema.parse(body);

    // 1. 챌린지 조회 및 라이프사이클 확인
    const challengeResult = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!challengeResult.Item) {
      return response(404, { error: 'CHALLENGE_NOT_FOUND', message: '챌린지를 찾을 수 없습니다' });
    }

    const challenge = challengeResult.Item;
    const challengePrice = Number(challenge.price ?? 0);
    const isPaidChallenge = Boolean(challenge.isPaid) || challengePrice > 0;
    const requiresApproval = isPaidChallenge ? (challenge.joinApprovalRequired ?? true) : false;

    // recruiting 단계에서만 참여 가능
    if (challenge.lifecycle !== 'recruiting') {
      const lifecycleMessages: Record<string, string> = {
        draft:      '아직 공개되지 않은 챌린지입니다',
        preparing:  '모집이 마감된 챌린지입니다',
        active:     '이미 진행 중인 챌린지입니다',
        completed:  '종료된 챌린지입니다',
        archived:   '보관된 챌린지입니다',
      };
      return response(409, {
        error: 'NOT_RECRUITING',
        message: lifecycleMessages[challenge.lifecycle] || '참여할 수 없는 챌린지입니다',
        lifecycle: challenge.lifecycle,
      });
    }

    // maxParticipants 체크
    if (challenge.maxParticipants !== null) {
      if (challenge.stats.totalParticipants >= challenge.maxParticipants) {
        return response(409, {
          error: 'CHALLENGE_FULL',
          message: '챌린지 정원이 마감되었습니다',
        });
      }
    }


    const { requirePersonalGoalOnJoin, requirePersonalTargetOnJoin } = resolveJoinRequirements(
      challenge.challengeType,
      challenge.layerPolicy,
    );

    if (requirePersonalGoalOnJoin && !input.personalGoal?.trim()) {
      return response(400, { error: 'PERSONAL_GOAL_REQUIRED', message: '이 챌린지는 참여 시 개인 목표 입력이 필요합니다' });
    }

    if (requirePersonalTargetOnJoin && !input.personalTarget) {
      return response(400, { error: 'PERSONAL_TARGET_REQUIRED', message: '이 챌린지는 참여 시 개인 목표시간 입력이 필요합니다' });
    }

    // 2. 이미 참여 중인지 확인
    const existingResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'challengeId = :challengeId AND #status <> :failed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':challengeId': challengeId,
        ':failed': 'failed',
      },
    }));

    if (existingResult.Items && existingResult.Items.length > 0) {
      return response(409, { error: 'ALREADY_JOINED', message: '이미 참여 중인 챌린지입니다' });
    }

    // 3. startDate = challenge.challengeStartAt (모든 참여자 동일)
    // KST 기준 날짜로 변환 (UTC split 시 하루 빠지는 문제 방지)
    const startDate = certDateFromIso(challenge.challengeStartAt, DEFAULT_TIMEZONE); // YYYY-MM-DD

    // groupId = challengeId (같은 챌린지 = 같은 코호트)
    const groupId = challengeId;

    // 4. UserChallenge 생성 (preparing phase로 시작)
    const userChallengeId = uuidv4();
    const now = new Date().toISOString();

    const personalTarget = input.personalTarget
      ? {
          ...input.personalTarget,
          time24: toTime24(input.personalTarget.hour12, input.personalTarget.minute, input.personalTarget.meridiem),
        }
      : null;

    const proposalDeadline = getProposalDeadline(challenge.challengeStartAt);

    // last_day 정책: 마지막 날(durationDays)이 보완 전용 → 정규 인증 day = durationDays - 1
    // anytime / disabled: 전체 durationDays가 정규 인증 day
    const remedyPolicyType = challenge.defaultRemedyPolicy?.type ?? 'anytime';
    const totalDays = challenge.durationDays ?? 7;
    const regularDays = remedyPolicyType === 'last_day' ? Math.max(totalDays - 1, 1) : totalDays;

    const userChallenge = {
      userChallengeId,
      userId,
      challengeId,
      startDate,
      phase: 'preparing',         // preparing → active (챌린지 시작일에 lifecycle-manager가 전환)
      status: requiresApproval ? 'pending' : 'active',
      currentDay: 0,
      progress: Array.from({ length: regularDays }, (_, i) => ({
        day: i + 1,
        status: null,
      })),
      score: 0,
      cheerScore: 0,
      thankScore: 0,
      deltaSum: 0,
      cheerCount: 0,
      groupId,
      personalGoal: input.personalGoal ?? null,
      personalTarget,
      joinStatus: requiresApproval ? 'requested' : 'approved',
      paymentStatus: isPaidChallenge ? (requiresApproval ? 'paid_pending_approval' : 'paid_confirmed') : 'free',
      refundStatus: 'none',
      refundLockedAt: challenge.challengeStartAt ?? null,
      consecutiveDays: 0,
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Item: userChallenge,
    }));

    // 5. 챌린지 stats 업데이트 (승인 즉시 참여 케이스만 active 반영)
    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: requiresApproval
        ? 'SET stats.totalParticipants = if_not_exists(stats.totalParticipants, :zero) + :inc, stats.pendingParticipants = if_not_exists(stats.pendingParticipants, :zero) + :inc, updatedAt = :now'
        : 'SET stats.totalParticipants = if_not_exists(stats.totalParticipants, :zero) + :inc, stats.activeParticipants = if_not_exists(stats.activeParticipants, :zero) + :inc, updatedAt = :now',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':inc': 1,
        ':now': now,
      },
    }));

    return response(201, {
      success: true,
      message: requiresApproval ? '참여 신청이 접수되었습니다. 승인 후 참여가 확정됩니다.' : '챌린지 참여가 완료되었습니다',
      data: {
        userChallengeId,
        phase: 'preparing',
        joinStatus: requiresApproval ? 'requested' : 'approved',
        paymentStatus: isPaidChallenge ? (requiresApproval ? 'paid_pending_approval' : 'paid_confirmed') : 'free',
        challenge: {
          challengeId: challenge.challengeId,
          title: challenge.title,
          category: challenge.category,
          targetTime: challenge.targetTime,
          badgeIcon: challenge.badgeIcon,
          challengeStartAt: challenge.challengeStartAt,
          recruitingEndAt: challenge.recruitingEndAt,
        },
        startDate,
        groupId,
        personalTarget,
        challengeType: challenge.challengeType || 'leader_personal',
        layerPolicy: challenge.layerPolicy || null,
        proposalDeadline,
        personalQuestAutoApprove: challenge.personalQuestAutoApprove ?? true,
      },
    });

  } catch (error: any) {
    console.error('Join challenge error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
