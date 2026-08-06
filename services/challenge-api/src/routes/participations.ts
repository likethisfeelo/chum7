/**
 * 참여 라우트 — /c/challenges/... (join·join-requests) + /c/user-challenges/... (give-up)
 * 레거시: POST /challenges/{id}/join, GET /challenges/{id}/join-requests,
 *         POST /challenges/{id}/join-requests/{ucId}/review, POST /user-challenges/{ucId}/give-up
 * (GET /challenges/my 는 routes/my-challenges.ts)
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { AppEnv } from '@chum7/api-kit';
import { docClient, ok, fail, publishEvent } from '@chum7/api-kit';
import { joinChallengeSchema, reviewJoinRequestSchema, disbandRequestSchema } from '../schemas';
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
import {
  disbandRequestQueuePk,
  disbandRequestSk,
  listChallengeDisbandRequests,
  putDisbandRequest,
} from '../repo/disband-requests';
import { stripKeys } from '../repo/shared';

export const participationRoutes = new Hono<AppEnv>();

/** 유료(참가비/보증금/티켓 포함) 챌린지 여부 — join 검증과 동일 규칙 (COMMERCE_V0.md). */
function isPaidChallenge(challenge: Record<string, any>): boolean {
  return (
    challenge.pricingType === 'paid_fee' ||
    challenge.pricingType === 'paid_deposit' ||
    Boolean(challenge.isPaid) ||
    Number(challenge.price ?? 0) > 0
  );
}

const ENDED_LIFECYCLES = new Set(['completed', 'archived']);

/** 챌린지의 소유자(리더) userId 해석 — 필드 별칭 흡수. */
function resolveOwnerId(challenge: Record<string, any>): string {
  return String(challenge.createdBy || challenge.creatorId || challenge.leaderId || '');
}

/**
 * 챌린지 전체 해산 실행 (무료: 리더 즉시 / 유료: 운영자 승인 후).
 *  - 챌린지 META: lifecycle='completed'(완료 탭 편입) + disbanded 표식. 정산 트리거(challenge.completed
 *    이벤트)는 발행하지 않으므로 자동 정산/지급은 일어나지 않는다(환불은 운영자 수동 — v0).
 *  - 리더 참여 레코드(있으면): 중도포기 표기.
 *  - 멤버 전원(리더 제외): challenge.disbanded 이벤트로 '전체 해산' 알림 팬아웃.
 * 반환: { memberIds } — 알림 팬아웃 대상.
 */
export async function executeDisband(
  challenge: Record<string, any>,
  challengeId: string,
  leaderId: string,
  reason?: string | null,
): Promise<{ memberIds: string[] }> {
  const nowIso = new Date().toISOString();

  await updateChallengeFields(
    challengeId,
    {
      lifecycle: 'completed',
      disbanded: true,
      disbandedAt: nowIso,
      disbandedBy: leaderId,
      ...(reason ? { disbandReason: reason } : {}),
      updatedAt: nowIso,
    },
    {
      lifecycle: challenge.lifecycle,
      category: challenge.category,
      challengeStartAt: challenge.challengeStartAt,
    },
  );

  const participants = await listChallengeParticipations(challengeId);
  const memberIds: string[] = [];
  for (const p of participants) {
    const participantId = String(p.userId ?? '');
    if (!participantId) continue;
    if (participantId === leaderId) {
      // 리더 본인은 중도포기로 표기 (참여 레코드가 있을 때만)
      await updateParticipationFields(challengeId, participantId, {
        phase: 'gave_up',
        status: 'gave_up',
        gaveUpAt: nowIso,
        updatedAt: nowIso,
      }).catch((err: any) =>
        console.error('disband: mark leader gave_up failed (non-fatal):', err?.message),
      );
      continue;
    }
    memberIds.push(participantId);
  }

  try {
    await publishEvent('challenge.disbanded', {
      challengeId,
      leaderId,
      title: typeof challenge.title === 'string' ? challenge.title : undefined,
      memberIds,
    });
  } catch (err: any) {
    console.error('disband: publish event error (non-fatal):', err?.message);
  }

  return { memberIds };
}

/**
 * 중도포기 '배추한포기' 뱃지 조건부 부여 — gamification 테이블 쓰기
 * (GAMIFICATION_TABLE env, 문서화된 크로스 도메인 예외. lifecycle-manager putBadgeIfAbsent와 동일 키/조건).
 * 실패해도 포기 처리 자체는 성공시킨다(뱃지는 부가 효과).
 */
async function grantGiveUpBadge(userId: string, challengeId: string): Promise<void> {
  const table = process.env.GAMIFICATION_TABLE;
  if (!table) return;
  const grantedAt = new Date().toISOString();
  const badgeId = 'cabbage-giveup';
  try {
    await docClient.send(
      new PutCommand({
        TableName: table,
        Item: {
          pk: `USER#${userId}`,
          sk: `BADGE#${badgeId}`,
          gsi1pk: `BADGE#${badgeId}`,
          gsi1sk: grantedAt,
          badgeId,
          userId,
          challengeId,
          grantedAt,
          createdAt: grantedAt,
          source: 'give_up',
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return; // 이미 보유
    console.error('give-up badge grant failed (non-fatal):', err?.message);
  }
}

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

  // 결제 게이트와 승인 게이트가 동일한 유료 판정을 쓰도록 통일 (pricingType 포함).
  // 과거: 승인 판정이 isPaid‖price>0만 봐서 pricingType=paid_* + price=0이면 결제는 요구하나
  // 리더 승인을 건너뛰는 모순이 있었다.
  const paid = isPaidChallenge(challenge);
  const requiresApproval = paid ? (challenge.joinApprovalRequired ?? true) : false;

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
  if (paid) {
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
    paymentStatus: paid ? (requiresApproval ? 'paid_pending_approval' : 'paid_confirmed') : 'free',
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
    paymentStatus: paid ? (requiresApproval ? 'paid_pending_approval' : 'paid_confirmed') : 'free',
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

  // '배추한포기' 뱃지 부여 (조건부 — 이미 보유 시 무시, 실패는 non-fatal)
  await grantGiveUpBadge(userId, uc.challengeId);

  // 매니저였다면 자동 해임 — 포기자는 운영 권한을 잃는다
  const managerIds: string[] = Array.isArray(challenge.managerIds) ? challenge.managerIds.map(String) : [];
  if (managerIds.includes(userId)) {
    await updateChallengeFields(uc.challengeId, {
      managerIds: managerIds.filter((id) => id !== userId),
      updatedAt: now,
    }).catch((err: any) => console.error('give-up: manager auto-remove failed (non-fatal):', err?.message));
  }

  return ok(c, { userChallengeId, phase: 'gave_up', status: 'gave_up' }, '챌린지를 중도 포기했습니다. 배추한포기 뱃지가 지급되었어요.');
});

// ── 챌린지 전체 해산 (리더) ────────────────────────────────────────────────
//  무료: 리더가 즉시 해산. 유료(참가비/보증금/티켓): 강제 해산 불가 → /disband-request 로 운영자 신청.
participationRoutes.post('/challenges/:challengeId/disband', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');

  const ownerId = resolveOwnerId(challenge);
  if (!ownerId || ownerId !== userId) {
    return fail(c, 403, 'FORBIDDEN', '챌린지 리더만 해산할 수 있어요');
  }
  if (ENDED_LIFECYCLES.has(String(challenge.lifecycle))) {
    return fail(c, 409, 'CHALLENGE_ALREADY_ENDED', '이미 종료된 챌린지예요');
  }
  if (isPaidChallenge(challenge)) {
    return fail(
      c,
      409,
      'PAID_REQUIRES_APPROVAL',
      '유료 챌린지는 리더가 바로 해산할 수 없어요. 사유와 함께 운영자에게 해산을 신청해주세요',
    );
  }

  const { memberIds } = await executeDisband(challenge, challengeId, userId);
  return ok(
    c,
    { challengeId, disbanded: true, lifecycle: 'completed', memberCount: memberIds.length },
    '챌린지를 해산했어요. 참여자에게 안내가 전송됩니다.',
  );
});

// ── 유료 챌린지 해산 신청 (리더 → 운영자) ──────────────────────────────────
participationRoutes.post('/challenges/:challengeId/disband-request', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');

  const ownerId = resolveOwnerId(challenge);
  if (!ownerId || ownerId !== userId) {
    return fail(c, 403, 'FORBIDDEN', '챌린지 리더만 해산을 신청할 수 있어요');
  }
  if (ENDED_LIFECYCLES.has(String(challenge.lifecycle))) {
    return fail(c, 409, 'CHALLENGE_ALREADY_ENDED', '이미 종료된 챌린지예요');
  }
  if (!isPaidChallenge(challenge)) {
    return fail(c, 400, 'NOT_PAID_CHALLENGE', '무료 챌린지는 신청 없이 바로 해산할 수 있어요');
  }

  const input = disbandRequestSchema.parse(await c.req.json().catch(() => ({})));

  // 중복 신청 방지 — 이미 대기 중(pending)인 신청이 있으면 409
  const existing = await listChallengeDisbandRequests(challengeId);
  if (existing.some((r) => r.status === 'pending')) {
    return fail(c, 409, 'ALREADY_REQUESTED', '이미 검토 대기 중인 해산 신청이 있어요');
  }

  const requestId = randomUUID();
  const nowIso = new Date().toISOString();
  await putDisbandRequest({
    pk: `CHAL#${challengeId}`,
    sk: disbandRequestSk(requestId),
    gsi2pk: disbandRequestQueuePk('pending'),
    gsi2sk: nowIso,
    entityType: 'disband_request',
    requestId,
    challengeId,
    challengeTitle: typeof challenge.title === 'string' ? challenge.title : null,
    leaderId: userId,
    reason: input.reason,
    pricingType: challenge.pricingType ?? (Number(challenge.price ?? 0) > 0 ? 'paid_fee' : null),
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  try {
    await publishEvent('challenge.disband_requested', { challengeId, leaderId: userId, requestId, reason: input.reason });
  } catch (err: any) {
    console.error('disband-request: publish event error (non-fatal):', err?.message);
  }

  return ok(
    c,
    { challengeId, requestId, status: 'pending' },
    '해산 신청을 접수했어요. 운영자 검토 후 결과를 알려드릴게요.',
    201,
  );
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
