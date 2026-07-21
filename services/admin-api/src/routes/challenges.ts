/**
 * 어드민 챌린지 관리 — 레거시 admin/challenge/{create,update,toggle,delete,lifecycle-transition,
 * confirm-start,list-mine,list-all} 이식. 전이 검증은 @chum7/core canTransition.
 * 그룹 매핑: admins→admins, productowners/managers→operators, leaders→creators (PORTING.md §2).
 */
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AppEnv } from '@chum7/api-kit';
import { fail, ok, requireGroup } from '@chum7/api-kit';
import { canTransition, type ChallengeLifecycle } from '@chum7/core';
import { createChallengeSchema, lifecycleTransitionSchema, updateChallengeSchema } from '../schemas';
import {
  calculateChallengeEndAt,
  initialLifecycle,
  resolveDurationDays,
  resolveLayerPolicy,
  resolvePersonalQuestEnabled,
  validateConfirmStart,
  validateRemedyPolicy,
  validateTimeline,
} from '../domain/challenge-admin';
import {
  CHALLENGE_LIFECYCLES,
  challengeKeys,
  confirmStartTransition,
  decrementPendingParticipants,
  deleteChallengeMeta,
  getChallenge,
  hasParticipants,
  listAllByPartitions,
  listByCreator,
  listParticipations,
  putChallenge,
  updateChallengeFields,
  updateParticipationFields,
} from '../repo/challenges';
import { recordAudit } from '../repo/audit';
import { stripKeys } from '../repo/shared';

export const challengeAdminRoutes = new Hono<AppEnv>();

function isPrivileged(groups: string[]): boolean {
  return groups.includes('admins') || groups.includes('operators');
}

// ── 내가 만든 챌린지 (레거시 GET /admin/challenges/mine — Scan → gsi2 CREATOR# Query) ──
challengeAdminRoutes.get('/mine', async (c) => {
  const { userId } = c.get('authUser')!;
  const challenges = (await listByCreator(userId))
    .map(stripKeys)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return ok(c, { challenges, total: challenges.length });
});

// ── 전체 챌린지 (레거시 GET /admin/challenges/all — Scan → gsi1 파티션 병합 Query) ──
challengeAdminRoutes.get('/all', requireGroup('admins', 'operators'), async (c) => {
  const { userId, groups } = c.get('authUser')!;
  const reason = (c.req.query('reason') ?? '').trim();
  if (groups.includes('admins') && reason.length < 5) {
    return fail(c, 400, 'MISSING_AUDIT_REASON', 'admins 전체 조회 시 사유를 5자 이상 입력해야 합니다');
  }

  const challenges = (await listAllByPartitions(CHALLENGE_LIFECYCLES))
    .map(stripKeys)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  console.info('[AUDIT][ADMIN_CHALLENGE_ALL_VIEW]', {
    requesterId: userId,
    groups,
    reason: reason || '(none)',
    total: challenges.length,
    at: new Date().toISOString(),
  });

  return ok(c, { challenges, total: challenges.length });
});

// ── 챌린지 생성 (레거시 POST /admin/challenges — admins|leaders → admins|creators) ──
challengeAdminRoutes.post('/', requireGroup('admins', 'creators'), async (c) => {
  const { userId } = c.get('authUser')!;
  const input = createChallengeSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date();
  const nowIso = now.toISOString();

  const remedyError = validateRemedyPolicy(input.defaultRemedyPolicy, input.durationDays);
  if (remedyError) return fail(c, 400, remedyError.error, remedyError.message);
  const timelineError = validateTimeline(input);
  if (timelineError) return fail(c, 400, timelineError.error, timelineError.message);

  const challengeId = randomUUID();
  const lifecycle = initialLifecycle(nowIso, input.recruitingStartAt);
  const challengeEndAt = calculateChallengeEndAt(input.challengeStartAt, input.durationDays);

  const challenge: Record<string, any> = {
    challengeId,
    title: input.title,
    description: input.description,
    category: input.category,
    targetTime: input.targetTime,
    identityKeyword: input.identityKeyword,
    badgeIcon: input.badgeIcon,
    badgeName: input.badgeName,
    lifecycle,
    recruitingStartAt: input.recruitingStartAt,
    recruitingEndAt: input.recruitingEndAt,
    challengeStartAt: input.challengeStartAt,
    challengeEndAt,
    endDate: challengeEndAt,
    durationDays: input.durationDays,
    maxParticipants: input.maxParticipants ?? null,
    challengeType: input.challengeType,
    layerPolicy: resolveLayerPolicy(input.challengeType, input.layerPolicy),
    defaultRemedyPolicy: {
      type: input.defaultRemedyPolicy.type,
      maxRemedyDays:
        input.defaultRemedyPolicy.type === 'last_day' ? input.defaultRemedyPolicy.maxRemedyDays : null,
    },
    personalQuestEnabled: resolvePersonalQuestEnabled(input.challengeType),
    personalQuestAutoApprove: input.personalQuestAutoApprove,
    requireStartConfirmation: input.requireStartConfirmation,
    joinApprovalRequired: input.joinApprovalRequired,
    allowedVerificationTypes: input.allowedVerificationTypes,
    stats: { totalParticipants: 0, activeParticipants: 0, completionRate: 0, averageDelta: 0 },
    participantCount: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: userId,
  };

  await putChallenge({
    ...challenge,
    ...challengeKeys({ challengeId, lifecycle, category: input.category, challengeStartAt: input.challengeStartAt, createdBy: userId, createdAt: nowIso }),
  });
  await recordAudit({ actorUserId: userId, action: 'challenge.create', targetType: 'challenge', targetId: challengeId, payload: input, now });

  return ok(c, challenge, '챌린지가 생성되었습니다', 201);
});

// ── 챌린지 수정 (레거시 PUT /admin/challenges/{id} — admins 전용) ──
challengeAdminRoutes.put('/:challengeId', requireGroup('admins'), async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  if (!challengeId) return fail(c, 400, 'MISSING_ID', '챌린지 ID가 필요합니다');
  const input = updateChallengeSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date();

  const existing = await getChallenge(challengeId);
  if (!existing) return fail(c, 404, 'NOT_FOUND', '챌린지를 찾을 수 없습니다');

  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) attrs[key] = value;
  }
  attrs.updatedAt = now.toISOString();

  await updateChallengeFields(challengeId, attrs, {
    lifecycle: existing.lifecycle,
    category: existing.category,
    challengeStartAt: existing.challengeStartAt,
  });
  await recordAudit({ actorUserId: userId, action: 'challenge.update', targetType: 'challenge', targetId: challengeId, payload: input, now });

  return ok(c, undefined, '챌린지가 수정되었습니다');
});

// ── 챌린지 삭제 (레거시 DELETE /admin/challenges/{id} — admins 전용) ──
challengeAdminRoutes.delete('/:challengeId', requireGroup('admins'), async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  if (!challengeId) return fail(c, 400, 'MISSING_ID', '챌린지 ID가 필요합니다');

  if (await hasParticipants(challengeId)) {
    return fail(c, 400, 'HAS_PARTICIPANTS', '참여자가 있는 챌린지는 삭제할 수 없습니다. 비활성화를 사용하세요.');
  }

  await deleteChallengeMeta(challengeId);
  await recordAudit({ actorUserId: userId, action: 'challenge.delete', targetType: 'challenge', targetId: challengeId, now: new Date() });
  return ok(c, undefined, '챌린지가 삭제되었습니다');
});

// ── 활성 토글 (레거시 PATCH /admin/challenges/{id}/toggle — admins 전용) ──
challengeAdminRoutes.patch('/:challengeId/toggle', requireGroup('admins'), async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  if (!challengeId) return fail(c, 400, 'MISSING_ID', '챌린지 ID가 필요합니다');
  const now = new Date();

  const existing = await getChallenge(challengeId);
  if (!existing) return fail(c, 404, 'NOT_FOUND', '챌린지를 찾을 수 없습니다');

  const newStatus = !existing.isActive;
  await updateChallengeFields(challengeId, { isActive: newStatus, updatedAt: now.toISOString() });
  await recordAudit({ actorUserId: userId, action: 'challenge.toggle', targetType: 'challenge', targetId: challengeId, payload: { isActive: newStatus }, now });

  return ok(c, { isActive: newStatus }, `챌린지가 ${newStatus ? '활성화' : '비활성화'}되었습니다`);
});

// ── 수동 lifecycle 전환 (레거시 PUT /admin/challenges/{id}/lifecycle — admins|operators|생성자) ──
challengeAdminRoutes.put('/:challengeId/lifecycle', async (c) => {
  const { userId, groups } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  if (!challengeId) return fail(c, 400, 'MISSING_ID', '챌린지 ID가 필요합니다');
  const input = lifecycleTransitionSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date();

  const existing = await getChallenge(challengeId);
  if (!existing) return fail(c, 404, 'NOT_FOUND', '챌린지를 찾을 수 없습니다');

  const isCreator = Boolean(existing.createdBy && existing.createdBy === userId);
  if (!isPrivileged(groups) && !isCreator) {
    return fail(c, 403, 'FORBIDDEN', '챌린지 상태 변경 권한이 없습니다');
  }

  const currentLifecycle = existing.lifecycle as ChallengeLifecycle;
  const targetLifecycle = input.lifecycle as ChallengeLifecycle;
  if (!canTransition(currentLifecycle, targetLifecycle)) {
    const allowedTransitions = CHALLENGE_LIFECYCLES.filter((to) =>
      canTransition(currentLifecycle, to as ChallengeLifecycle),
    );
    return fail(c, 409, 'INVALID_TRANSITION', `${currentLifecycle} → ${targetLifecycle} 전환은 허용되지 않습니다`, {
      data: { allowedTransitions },
    });
  }

  await updateChallengeFields(
    challengeId,
    { lifecycle: targetLifecycle, updatedAt: now.toISOString() },
    { lifecycle: existing.lifecycle, category: existing.category, challengeStartAt: existing.challengeStartAt },
  );
  await recordAudit({
    actorUserId: userId,
    action: 'challenge.lifecycle',
    targetType: 'challenge',
    targetId: challengeId,
    payload: { from: currentLifecycle, to: targetLifecycle, reason: input.reason ?? null },
    now,
  });

  return ok(
    c,
    { previousLifecycle: currentLifecycle, lifecycle: targetLifecycle },
    `챌린지 상태가 변경되었습니다: ${currentLifecycle} → ${targetLifecycle}`,
  );
});

// ── 시작 확인 (레거시 POST /admin/challenges/{id}/confirm-start — admins|operators|생성자) ──
challengeAdminRoutes.post('/:challengeId/confirm-start', async (c) => {
  const { userId, groups } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  if (!challengeId) return fail(c, 400, 'MISSING_CHALLENGE_ID', '챌린지 ID가 필요합니다');
  const now = new Date();
  const nowIso = now.toISOString();

  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');

  const isCreator = challenge.createdBy === userId;
  if (!isPrivileged(groups) && !isCreator) {
    return fail(c, 403, 'FORBIDDEN', '챌린지 생성자 또는 관리자만 확인할 수 있습니다.');
  }

  const guard = validateConfirmStart(challenge);
  if (guard) return fail(c, guard.status, guard.error, guard.message);

  const durationDays = resolveDurationDays(challenge.durationDays);
  try {
    await confirmStartTransition(challengeId, {
      nowIso,
      endAt: calculateChallengeEndAt(nowIso, durationDays),
      confirmedBy: userId,
      category: challenge.category,
      challengeStartAt: challenge.challengeStartAt,
    });
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return fail(c, 409, 'ALREADY_TRANSITIONED_OR_INVALID_STATE', '이미 전환되었거나 유효하지 않은 상태입니다');
    }
    throw error;
  }

  // side effects: 미승인 참여 자동 거절 + 승인 참여 활성화 (알림은 이벤트 계약 부재로 미이식 — PORTING.md §3)
  const participations = await listParticipations(challengeId);
  let rejectedCount = 0;
  for (const uc of participations) {
    if (uc.phase !== 'preparing') continue;
    if (uc.joinStatus === 'requested') {
      const isPaid = uc.paymentStatus && uc.paymentStatus !== 'free';
      await updateParticipationFields(challengeId, uc.userId, {
        status: 'failed',
        joinStatus: 'rejected',
        phase: 'failed',
        ...(isPaid ? { paymentStatus: 'refunded', refundStatus: 'completed' } : {}),
        updatedAt: nowIso,
      });
      rejectedCount += 1;
    } else if (uc.joinStatus === 'approved' || uc.joinStatus === undefined) {
      await updateParticipationFields(challengeId, uc.userId, { phase: 'active', currentDay: 1, updatedAt: nowIso });
    }
  }
  if (rejectedCount > 0) {
    await decrementPendingParticipants(challengeId, rejectedCount, nowIso);
  }

  await recordAudit({
    actorUserId: userId,
    action: 'challenge.confirm-start',
    targetType: 'challenge',
    targetId: challengeId,
    payload: { rejectedCount, activated: true },
    now,
  });

  return ok(c, { challengeId, lifecycle: 'active', startConfirmedAt: nowIso, startConfirmedBy: userId }, '챌린지가 시작되었습니다.');
});
