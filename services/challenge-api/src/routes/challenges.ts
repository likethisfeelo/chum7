/**
 * 사용자 챌린지 생성/수정/공개 라우트 — /c/challenges...
 * 레거시: POST /challenges/me/create, GET /challenges/me/created,
 *         PATCH /challenges/{id}, PATCH /challenges/{id}/publish
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail, publishEvent } from '@chum7/api-kit';
import { canTransition, type ChallengeLifecycle } from '@chum7/core';
import { createChallengeSchema, updateChallengeSchema } from '../schemas';
import { resolveLayerPolicy, resolvePersonalQuestEnabled } from '../domain/join-requirements';
import {
  challengeKeys,
  getChallenge,
  listByCreator,
  putChallenge,
  updateChallengeFields,
} from '../repo/challenges';
import {
  getParticipation,
  listChallengeParticipations,
  participationKeys,
  putParticipation,
  updateParticipationFields,
} from '../repo/participations';
import { listDraws } from '../repo/draws';
import { stripKeys } from '../repo/shared';

export const challengeRoutes = new Hono<AppEnv>();

const MIN_PREPARING_GAP_MS = 60 * 1000;

// 내 보상 조회 — 종료 후 참여자 보상 카드용 (추첨 당첨 내역 + 완주 여부).
// 선물 교환권은 commerce(/pay/gifts/my)가 담당 — 여기서는 challenges 도메인 데이터만.
challengeRoutes.get('/:challengeId/my-rewards', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');

  const participation = await getParticipation(challengeId, userId);
  if (!participation) return fail(c, 404, 'NOT_A_PARTICIPANT', '참여 정보를 찾을 수 없습니다');

  const draws = await listDraws(challengeId);
  const drawWins = draws
    .filter((d) => Array.isArray(d.winners) && d.winners.some((w: any) => String(w.userId) === userId))
    .map((d) => ({
      drawId: String(d.drawId),
      title: (d.title as string) ?? null,
      createdAt: (d.createdAt as string) ?? null,
    }));

  return ok(c, {
    isCompleted: participation.status === 'completed' || participation.phase === 'completed',
    drawWins,
  });
});

// 챌린지 생성 (레거시 POST /challenges/me/create — 사용자 생성, 항상 draft로 시작)
challengeRoutes.post('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = createChallengeSchema.parse(await c.req.json().catch(() => ({})));

  // 보완 횟수 제한: 보완 대상은 지나간 날뿐이므로 durationDays - 1을 초과할 수 없음
  const rp = input.defaultRemedyPolicy;
  if (rp.type !== 'disabled' && rp.maxRemedyDays !== null && rp.maxRemedyDays > input.durationDays - 1) {
    return fail(c, 400, 'INVALID_MAX_REMEDY_DAYS',
      `최대 보완 횟수는 챌린지 기간 - 1(${input.durationDays - 1})을 초과할 수 없습니다`);
  }

  // Timeline 순서 검증
  const recruitingStart = new Date(input.recruitingStartAt);
  const recruitingEnd = new Date(input.recruitingEndAt);
  const challengeStart = new Date(input.challengeStartAt);

  if (recruitingEnd <= recruitingStart) {
    return fail(c, 400, 'INVALID_TIMELINE', '모집 마감일은 모집 시작일 이후여야 합니다');
  }
  if (challengeStart.getTime() < recruitingEnd.getTime() + MIN_PREPARING_GAP_MS) {
    return fail(c, 400, 'INVALID_TIMELINE', '챌린지 시작일은 모집 마감 시각으로부터 최소 1분 이후여야 합니다');
  }

  const challengeEnd = new Date(challengeStart);
  challengeEnd.setDate(challengeEnd.getDate() + input.durationDays);

  const challengeId = randomUUID();
  const now = new Date().toISOString();

  const normalizedLayerPolicy = resolveLayerPolicy(input.challengeType, input.layerPolicy);

  const initialStats = input.participateAsCreator
    ? { totalParticipants: 1, activeParticipants: 1, completionRate: 0, averageDelta: 0, pendingParticipants: 0, completionCount: 0 }
    : { totalParticipants: 0, activeParticipants: 0, completionRate: 0, averageDelta: 0, pendingParticipants: 0, completionCount: 0 };

  const challenge = {
    challengeId,
    title: input.title,
    description: input.description,
    category: input.category,
    targetTime: input.targetTime,
    identityKeyword: input.identityKeyword,
    badgeIcon: input.badgeIcon,
    badgeName: input.badgeName,
    // 완주 보상 — 배지 외 실물/온라인(기프티콘) 상품 지급(선택)
    rewardPhysical: input.rewardPhysical ?? null,
    rewardOnline: input.rewardOnline ?? null,
    // 대표 이미지(배너 카드) — 없으면 프론트에서 카테고리 컬러로 폴백
    coverImageUrl: input.coverImageUrl ?? null,

    // 항상 draft로 시작 — 생성자가 수동으로 공개
    lifecycle: 'draft',
    recruitingStartAt: input.recruitingStartAt,
    recruitingEndAt: input.recruitingEndAt,
    challengeStartAt: input.challengeStartAt,
    challengeEndAt: challengeEnd.toISOString(),
    endDate: challengeEnd.toISOString(),
    durationDays: input.durationDays,
    maxParticipants: input.maxParticipants ?? null,
    challengeType: input.challengeType,
    layerPolicy: normalizedLayerPolicy,
    defaultRemedyPolicy: {
      type: input.defaultRemedyPolicy.type,
      // anytime도 횟수 제한 가능 (생성 UI '기간 중 1회만' = anytime + maxRemedyDays:1)
      maxRemedyDays:
        input.defaultRemedyPolicy.type === 'disabled' ? null : input.defaultRemedyPolicy.maxRemedyDays,
    },
    personalQuestEnabled: resolvePersonalQuestEnabled(input.challengeType),
    personalQuestAutoApprove: input.personalQuestAutoApprove,
    requireStartConfirmation: input.requireStartConfirmation,
    joinApprovalRequired: input.joinApprovalRequired,
    allowedVerificationTypes: input.allowedVerificationTypes,
    // 참여자 식별 방식(운영탭 전용 표시) — 생성 시 리더 확정, 피드·마당 익명은 유지
    leaderIdentityMode: input.leaderIdentityMode,
    stats: initialStats,
    participantCount: input.participateAsCreator ? 1 : 0,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };

  await putChallenge({
    ...challenge,
    ...challengeKeys({
      challengeId,
      lifecycle: 'draft',
      category: input.category,
      challengeStartAt: input.challengeStartAt,
      createdBy: userId,
      createdAt: now,
    }),
  });

  // 생성자가 참여자로도 등록될 경우 userChallenge 레코드 생성
  if (input.participateAsCreator) {
    const userChallengeId = randomUUID();
    await putParticipation({
      ...participationKeys(challengeId, userId, now),
      userChallengeId,
      userId,
      challengeId,
      groupId: challengeId,
      phase: 'preparing',
      status: 'active',
      joinStatus: 'approved',
      paymentStatus: 'free',
      score: 0,
      cheerScore: 0,
      thankScore: 0,
      deltaSum: 0,
      cheerCount: 0,
      consecutiveDays: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  return ok(c, challenge, '챌린지가 생성됐어요. 준비가 되면 모집을 시작해보세요!', 201);
});

// 내가 만든 챌린지 목록 (레거시 GET /challenges/me/created — gsi2 CREATOR# Query)
challengeRoutes.get('/my-created', async (c) => {
  const { userId } = c.get('authUser')!;
  const items = await listByCreator(userId);
  const challenges = items
    .map(stripKeys)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return ok(c, { challenges, total: challenges.length });
});

// 챌린지 공개 (레거시 PATCH /challenges/{id}/publish — draft → recruiting, 생성자 전용)
challengeRoutes.patch('/:challengeId/publish', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');

  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');

  if (challenge.createdBy !== userId) {
    return fail(c, 403, 'FORBIDDEN', '본인이 만든 챌린지만 공개할 수 있어요');
  }

  // 상태 머신(@chum7/core) 준수 — draft → recruiting만 허용 (레거시 ALREADY_PUBLISHED 코드 승계)
  if (challenge.lifecycle !== 'draft' || !canTransition(challenge.lifecycle as ChallengeLifecycle, 'recruiting')) {
    return fail(c, 409, 'ALREADY_PUBLISHED', '이미 공개된 챌린지예요');
  }

  // 수동 공개는 예약 오픈 시각(recruitOpenAt) 이전에도 허용한다 —
  // "시간 되면 자동, 그전에는 수동 가능" (docs/time-policy.md R1). 기존 차단 로직 제거.
  const now = new Date();

  await updateChallengeFields(
    challengeId,
    { lifecycle: 'recruiting', recruitOpenedAt: now.toISOString(), updatedAt: now.toISOString() },
    {
      lifecycle: challenge.lifecycle,
      category: challenge.category,
      challengeStartAt: challenge.challengeStartAt,
    },
  );

  // 관심영역(리더+카테고리) 구독자 알림 — 통지이므로 실패해도 무시
  await publishEvent('challenge.recruiting', {
    challengeId,
    leaderId: String(challenge.leaderId || challenge.createdBy),
    category: String(challenge.category || ''),
    title: String(challenge.title || ''),
  });

  return ok(c, { challengeId, lifecycle: 'recruiting' }, '챌린지 모집이 시작됐어요!');
});

// 챌린지 수정 (레거시 PATCH /challenges/{id} — 생성자 전용, draft/recruiting만)
const EDITABLE_LIFECYCLES = ['draft', 'recruiting'];

challengeRoutes.patch('/:challengeId', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');

  const parsed = updateChallengeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다', { details: parsed.error.errors });
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return fail(c, 400, 'NO_FIELDS', '수정할 항목을 하나 이상 입력해주세요');
  }

  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  if (challenge.createdBy !== userId) return fail(c, 403, 'FORBIDDEN', '본인이 만든 챌린지만 수정할 수 있어요');
  if (!EDITABLE_LIFECYCLES.includes(challenge.lifecycle)) {
    return fail(c, 409, 'NOT_EDITABLE',
      `${challenge.lifecycle} 상태에서는 수정할 수 없어요 (draft, recruiting 상태만 가능)`);
  }

  const now = new Date().toISOString();
  const attrs: Record<string, unknown> = { updatedAt: now };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    attrs[key] = value;
  }

  // 보완 정책 변경 — 횟수 상한 검증 + 정규 인증일 수가 바뀌면(anytime계열↔last_day)
  // 기존 참여자의 진행표를 재구성한다 (시작 전이라 진행 데이터가 없어 안전).
  if (updates.defaultRemedyPolicy) {
    const durationDays = Number(challenge.durationDays ?? 7);
    const newPolicy = updates.defaultRemedyPolicy;
    if (newPolicy.type !== 'disabled' && newPolicy.maxRemedyDays !== null && newPolicy.maxRemedyDays > durationDays - 1) {
      return fail(c, 400, 'INVALID_MAX_REMEDY_DAYS',
        `최대 보완 횟수는 챌린지 기간 - 1(${durationDays - 1})을 초과할 수 없습니다`);
    }
    attrs.defaultRemedyPolicy = {
      type: newPolicy.type,
      maxRemedyDays: newPolicy.type === 'disabled' ? null : newPolicy.maxRemedyDays,
    };

    const oldType = challenge.defaultRemedyPolicy?.type ?? 'anytime';
    const oldRegular = oldType === 'last_day' ? Math.max(durationDays - 1, 1) : durationDays;
    const newRegular = newPolicy.type === 'last_day' ? Math.max(durationDays - 1, 1) : durationDays;
    if (oldRegular !== newRegular) {
      const participants = await listChallengeParticipations(challengeId);
      const freshProgress = Array.from({ length: newRegular }, (_, i) => ({ day: i + 1, status: null }));
      for (const p of participants) {
        const pUserId = String(p.userId ?? '');
        if (!pUserId) continue;
        await updateParticipationFields(challengeId, pUserId, { progress: freshProgress, updatedAt: now });
      }
    }
  }

  await updateChallengeFields(challengeId, attrs, {
    lifecycle: challenge.lifecycle,
    category: challenge.category,
    challengeStartAt: challenge.challengeStartAt,
  });

  return ok(c, { challengeId }, '챌린지가 수정됐어요');
});
