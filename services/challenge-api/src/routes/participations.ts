/**
 * 참여 라우트 — /c/challenges/... (join·join-requests) + /c/user-challenges/... (give-up)
 * 레거시: POST /challenges/{id}/join, GET /challenges/{id}/join-requests,
 *         POST /challenges/{id}/join-requests/{ucId}/review, POST /user-challenges/{ucId}/give-up
 * (GET /challenges/my 는 routes/my-challenges.ts)
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { AppEnv } from '@chum7/api-kit';
import { docClient, ok, fail } from '@chum7/api-kit';
import { joinChallengeSchema, reviewJoinRequestSchema } from '../schemas';
import { getProposalDeadline, resolveJoinRequirements, toTime24 } from '../domain/join-requirements';
import { certDateFromIso, DEFAULT_TIMEZONE, safeTimezone } from '../domain/day-sync';
import { adjustChallengeStats, getChallenge, updateChallengeFields } from '../repo/challenges';
import {
  findMyParticipationByUcId,
  getParticipation,
  listChallengeParticipations,
  participationKeys,
  putParticipation,
  updateParticipationFields,
} from '../repo/participations';
import { stripKeys } from '../repo/shared';

export const participationRoutes = new Hono<AppEnv>();

/** 결제 주문 조회 — commerce 테이블 읽기 전용 (COMMERCE_TABLE env, 문서화된 예외) */
async function getPaidOrderReadonly(
  orderId: string,
): Promise<{ status?: string; userId?: string; challengeId?: string } | undefined> {
  const table = process.env.COMMERCE_TABLE;
  if (!table) return undefined;
  const result = await docClient.send(
    new GetCommand({
      TableName: table,
      Key: { pk: `ORDER#${orderId}`, sk: 'META' },
      ProjectionExpression: '#s, userId, challengeId',
      ExpressionAttributeNames: { '#s': 'status' },
    }),
  );
  return result.Item as { status?: string; userId?: string; challengeId?: string } | undefined;
}

// 챌린지 참여 (레거시 POST /challenges/{challengeId}/join)
participationRoutes.post('/challenges/:challengeId/join', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const input = joinChallengeSchema.parse(await c.req.json().catch(() => ({})));

  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');

  const challengePrice = Number(challenge.price ?? 0);
  const isPaidChallenge = Boolean(challenge.isPaid) || challengePrice > 0;
  const requiresApproval = isPaidChallenge ? (challenge.joinApprovalRequired ?? true) : false;

  // recruiting 단계에서만 참여 가능
  if (challenge.lifecycle !== 'recruiting') {
    const lifecycleMessages: Record<string, string> = {
      draft: '아직 공개되지 않은 챌린지입니다',
      preparing: '모집이 마감된 챌린지입니다',
      active: '이미 진행 중인 챌린지입니다',
      completed: '종료된 챌린지입니다',
      archived: '보관된 챌린지입니다',
    };
    return c.json({
      error: 'NOT_RECRUITING',
      message: lifecycleMessages[challenge.lifecycle] || '참여할 수 없는 챌린지입니다',
      lifecycle: challenge.lifecycle,
    }, 409);
  }

  // 생성자는 위자드를 통한 중복 참여 불가
  if (challenge.createdBy === userId) {
    return fail(c, 409, 'CREATOR_CANNOT_JOIN', '챌린지 생성자는 생성 시 참여 여부를 선택했습니다');
  }

  // 유료 챌린지: 결제 완료(paid) 주문 필요 — commerce 테이블 읽기 전용 검증
  // (커머스 v0: 쿠폰 또는 어드민 수동 입금 확인으로 paid 상태가 됨. COMMERCE_V0.md 참조)
  const isPaidPricing =
    challenge.pricingType === 'paid_fee' || challenge.pricingType === 'paid_deposit' || isPaidChallenge;
  if (isPaidPricing) {
    if (!input.orderId) {
      return fail(c, 402, 'ORDER_REQUIRED', '유료 챌린지는 결제(또는 쿠폰 적용) 후 참여할 수 있습니다');
    }
    const paidOrder = await getPaidOrderReadonly(input.orderId);
    if (
      !paidOrder ||
      paidOrder.status !== 'paid' ||
      paidOrder.userId !== userId ||
      paidOrder.challengeId !== challengeId
    ) {
      return fail(c, 402, 'ORDER_NOT_PAID', '결제가 확인되지 않았습니다. 주문 상태를 확인해주세요');
    }
  }

  // maxParticipants 체크
  if (challenge.maxParticipants !== null && challenge.maxParticipants !== undefined) {
    if ((challenge.stats?.totalParticipants ?? 0) >= challenge.maxParticipants) {
      return fail(c, 409, 'CHALLENGE_FULL', '챌린지 정원이 마감되었습니다');
    }
  }

  const { requirePersonalGoalOnJoin, requirePersonalTargetOnJoin } = resolveJoinRequirements(
    challenge.challengeType,
    challenge.layerPolicy,
  );

  if (requirePersonalGoalOnJoin && !input.personalGoal?.trim()) {
    return fail(c, 400, 'PERSONAL_GOAL_REQUIRED', '이 챌린지는 참여 시 개인 목표 입력이 필요합니다');
  }
  if (requirePersonalTargetOnJoin && !input.personalTarget) {
    return fail(c, 400, 'PERSONAL_TARGET_REQUIRED', '이 챌린지는 참여 시 개인 목표시간 입력이 필요합니다');
  }

  // 이미 참여 중인지 확인 — (challengeId, userId) 자연 키 Get (failed면 재참여 허용, 레거시 승계)
  const existing = await getParticipation(challengeId, userId);
  if (existing && existing.status !== 'failed') {
    return fail(c, 409, 'ALREADY_JOINED', '이미 참여 중인 챌린지입니다');
  }

  // startDate = challenge.challengeStartAt (KST 기준 날짜 — 레거시 승계)
  const startDate = certDateFromIso(challenge.challengeStartAt, DEFAULT_TIMEZONE);
  const groupId = challengeId;

  const userChallengeId = randomUUID();
  const now = new Date().toISOString();

  const personalTarget = input.personalTarget
    ? {
        ...input.personalTarget,
        time24: toTime24(input.personalTarget.hour12, input.personalTarget.minute, input.personalTarget.meridiem),
      }
    : null;

  const proposalDeadline = getProposalDeadline(challenge.challengeStartAt);

  // last_day 정책: 마지막 날이 보완 전용 → 정규 인증 day = durationDays - 1
  const remedyPolicyType = challenge.defaultRemedyPolicy?.type ?? 'anytime';
  const totalDays = challenge.durationDays ?? 7;
  const regularDays = remedyPolicyType === 'last_day' ? Math.max(totalDays - 1, 1) : totalDays;

  await putParticipation({
    ...participationKeys(challengeId, userId, now),
    userChallengeId,
    userId,
    challengeId,
    startDate,
    phase: 'preparing',
    status: requiresApproval ? 'pending' : 'active',
    currentDay: 0,
    progress: Array.from({ length: regularDays }, (_, i) => ({ day: i + 1, status: null })),
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
  });

  await adjustChallengeStats(
    challengeId,
    requiresApproval ? { total: 1, pending: 1 } : { total: 1, active: 1 },
    now,
  );

  return ok(c, {
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
  }, requiresApproval ? '참여 신청이 접수되었습니다. 승인 후 참여가 확정됩니다.' : '챌린지 참여가 완료되었습니다', 201);
});

// 참여 신청 목록 (레거시 GET /challenges/{id}/join-requests — 리더 전용, 플랫 바디 승계)
participationRoutes.get('/challenges/:challengeId/join-requests', async (c) => {
  const { userId: requesterId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');

  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  const challengeOwnerId = challenge.createdBy || challenge.creatorId;
  if (!challengeOwnerId || challengeOwnerId !== requesterId) {
    return fail(c, 403, 'FORBIDDEN', '챌린지 리더만 조회할 수 있습니다');
  }

  const participants = await listChallengeParticipations(challengeId);
  const requests = participants
    .filter((p) => p.status === 'pending')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 100)
    .map(stripKeys);

  // 레거시 응답 바디(비 envelope 플랫) 유지
  return c.json({ requests, total: requests.length }, 200);
});

// 참여 신청 심사 (레거시 POST /challenges/{id}/join-requests/{ucId}/review)
participationRoutes.post('/challenges/:challengeId/join-requests/:userChallengeId/review', async (c) => {
  const { userId: requesterId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const userChallengeId = c.req.param('userChallengeId');

  const body = await c.req.json().catch(() => ({}));
  const parsed = reviewJoinRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, 'VALIDATION_ERROR', 'decision은 approve 또는 reject만 허용됩니다.');
  }
  const decision = parsed.data.decision;
  const reason = typeof parsed.data.reason === 'string' ? parsed.data.reason.trim() : null;

  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  const challengeOwnerId = challenge.createdBy || challenge.creatorId;
  if (!challengeOwnerId || challengeOwnerId !== requesterId) {
    return fail(c, 403, 'FORBIDDEN', '챌린지 리더만 심사할 수 있습니다');
  }

  const participants = await listChallengeParticipations(challengeId);
  const uc = participants.find((p) => p.userChallengeId === userChallengeId);
  if (!uc) return fail(c, 404, 'JOIN_REQUEST_NOT_FOUND', '참여 신청을 찾을 수 없습니다');
  if (uc.status !== 'pending') {
    return fail(c, 409, 'INVALID_STATUS', '대기중 요청만 심사할 수 있습니다.');
  }

  const now = new Date().toISOString();
  try {
    if (decision === 'approve') {
      await updateParticipationFields(
        challengeId,
        uc.userId,
        {
          status: 'active',
          joinStatus: 'approved',
          approvedAt: now,
          reviewedBy: requesterId,
          updatedAt: now,
          paymentStatus: uc.paymentStatus ?? 'free',
        },
        { expression: '#st = :pendingCurrent', names: { '#st': 'status' }, values: { ':pendingCurrent': 'pending' } },
      );
      await adjustChallengeStats(challengeId, { pending: -1, active: 1 }, now);
      console.log(JSON.stringify({ type: 'kpi-event', name: 'challenge_join_approved', challengeId, userChallengeId, at: now }));
      return c.json({ success: true, decision: 'approve', reviewedAt: now }, 200);
    }

    await updateParticipationFields(
      challengeId,
      uc.userId,
      {
        status: 'failed',
        joinStatus: 'rejected',
        paymentStatus: 'refunded',
        refundStatus: 'completed',
        rejectedAt: now,
        reviewedBy: requesterId,
        reviewReason: reason,
        updatedAt: now,
      },
      { expression: '#st = :pendingCurrent', names: { '#st': 'status' }, values: { ':pendingCurrent': 'pending' } },
    );
    await adjustChallengeStats(challengeId, { pending: -1 }, now);
    console.log(JSON.stringify({ type: 'kpi-event', name: 'challenge_join_rejected_refunded', challengeId, userChallengeId, at: now }));

    return c.json({
      success: true,
      decision: 'reject',
      reviewedAt: now,
      refund: { status: 'completed', reason: 'JOIN_REJECTED' },
    }, 200);
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return fail(c, 409, 'ALREADY_REVIEWED_OR_INVALID_STATE', '이미 심사되었거나 심사할 수 없는 상태입니다');
    }
    throw error;
  }
});

// 챌린지 중도 포기 (레거시 POST /user-challenges/{ucId}/give-up)
participationRoutes.post('/user-challenges/:userChallengeId/give-up', async (c) => {
  const { userId } = c.get('authUser')!;
  const userChallengeId = c.req.param('userChallengeId');

  // 본인 파티션(gsi1 UCUSER#)에서 조회 — 소유권 내장 (레거시 FORBIDDEN 케이스는 NOT_FOUND로 흡수)
  const uc = await findMyParticipationByUcId(userId, userChallengeId);
  if (!uc) return fail(c, 404, 'NOT_FOUND', '참여 정보를 찾을 수 없습니다');

  if (uc.phase === 'gave_up' || uc.status === 'gave_up') {
    return fail(c, 409, 'ALREADY_GAVE_UP', '이미 중도 포기한 챌린지입니다');
  }
  if (uc.status === 'completed' || uc.status === 'failed' || uc.phase === 'completed' || uc.phase === 'failed') {
    return fail(c, 409, 'CHALLENGE_ALREADY_ENDED', '이미 종료된 챌린지는 포기할 수 없습니다');
  }

  const challenge = await getChallenge(uc.challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');

  if (challenge.leaderId === userId) {
    return fail(c, 403, 'LEADER_CANNOT_GIVE_UP', '챌린지 리더는 포기할 수 없습니다');
  }

  const now = new Date().toISOString();
  await updateParticipationFields(uc.challengeId, userId, {
    phase: 'gave_up',
    status: 'gave_up',
    gaveUpAt: now,
    updatedAt: now,
  });

  // "포기는쉽다" 뱃지 부여는 gamification 도메인 소유 — 이벤트 계약 필요 (PORTING.md gap 기록)

  return ok(c, { userChallengeId, phase: 'gave_up', status: 'gave_up' }, '챌린지를 중도 포기했습니다.');
});

// ── 수동 모집 마감 (예약 마감보다 먼저 가능 — docs/time-policy.md R1) ──────────
participationRoutes.post('/challenges/:challengeId/close-recruiting', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  if (challenge.createdBy !== userId) {
    return fail(c, 403, 'FORBIDDEN', '본인이 만든 챌린지만 마감할 수 있어요');
  }
  if (challenge.lifecycle !== 'recruiting') {
    return fail(c, 409, 'NOT_RECRUITING', '모집 중인 챌린지만 마감할 수 있어요');
  }
  const nowIso = new Date().toISOString();
  await updateChallengeFields(
    challengeId,
    { lifecycle: 'preparing', recruitClosedAt: nowIso, updatedAt: nowIso },
    { lifecycle: challenge.lifecycle, category: challenge.category, challengeStartAt: challenge.challengeStartAt },
  );
  return ok(c, { challengeId, lifecycle: 'preparing', recruitClosedAt: nowIso }, '모집을 마감했어요');
});

// ── 수동 조기 시작 (예정일 전 가능 — 유효 시작일 재산정, docs/time-policy.md R3) ──
participationRoutes.post('/challenges/:challengeId/start', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  if (challenge.createdBy !== userId) {
    return fail(c, 403, 'FORBIDDEN', '본인이 만든 챌린지만 시작할 수 있어요');
  }
  if (challenge.lifecycle !== 'recruiting' && challenge.lifecycle !== 'preparing') {
    return fail(c, 409, 'CANNOT_START', '모집 중이거나 시작 대기 상태에서만 시작할 수 있어요');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const timezone = safeTimezone(c.req.header('x-user-timezone') || (challenge.timezone as string));
  const effectiveStartDate = certDateFromIso(nowIso, timezone);
  const durationDays = Number(challenge.durationDays) > 0 ? Math.floor(Number(challenge.durationDays)) : 7;
  const challengeEndAt = new Date(now.getTime() + durationDays * 86_400_000).toISOString();

  // 조기 시작 = 시작 확인으로 간주 (startConfirmedAt 동시 스탬프)
  // actualStartAt이 예정일(challengeStartAt)을 대체 — Day 계산·완주 판정의 기준이 됨
  await updateChallengeFields(
    challengeId,
    {
      lifecycle: 'active',
      actualStartAt: nowIso,
      startConfirmedAt: nowIso,
      challengeEndAt,
      updatedAt: nowIso,
    },
    { lifecycle: challenge.lifecycle, category: challenge.category, challengeStartAt: challenge.challengeStartAt },
  );

  // 참여자 활성화 — lifecycle-manager 워커의 active 진입 규칙과 동일
  // (승인분 활성화 + startDate 유효 시작일 스탬프, 미승인 신청 자동 거절)
  const participations = await listChallengeParticipations(challengeId);
  let activated = 0;
  let rejected = 0;
  for (const uc of participations) {
    const isPendingLike = uc.status === 'pending' || uc.phase === 'preparing';
    if (!isPendingLike) continue;
    if (uc.joinStatus === 'requested') {
      await updateParticipationFields(challengeId, uc.userId, {
        status: 'rejected', joinStatus: 'auto_rejected', updatedAt: nowIso,
      });
      rejected += 1;
    } else {
      await updateParticipationFields(challengeId, uc.userId, {
        status: 'active', phase: 'active', startDate: effectiveStartDate, updatedAt: nowIso,
      });
      activated += 1;
    }
  }

  return ok(
    c,
    { challengeId, lifecycle: 'active', actualStartAt: nowIso, startDate: effectiveStartDate, activated, rejected },
    '챌린지를 시작했어요! 오늘이 Day 1이에요 🎉',
  );
});
