/**
 * 리더 운영 도구 v1 — /c/:challengeId/leader/...
 *  GET briefing     : 오늘 인증률 n/m + 미인증자 목록 + 대기 제출물 수 (UC#·QSUB# 아이템에서 계산)
 *  GET participants : 참여자 목록 (진행률 포함)
 * 리마인드 발송·메시지 템플릿·시즌 복제는 v2 — PORTING.md TODO 기록.
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv, ApiContext } from '@chum7/api-kit';
import { ok, fail, publishEvent } from '@chum7/api-kit';
import { calendarDay } from '@chum7/core';
import {
  certDateFromIso,
  calculateEffectiveCurrentDay,
  isCompletedProgressStatus,
  resolveDurationDays,
  safeTimezone,
} from '../domain/day-sync';
import { normalizeProgress } from '../domain/progress';
import { createDayCompletionRules } from '../domain/verification-rules';
import { getChallenge, updateChallengeFields } from '../repo/challenges';
import {
  getParticipation,
  listChallengeParticipations,
  updateParticipationFields,
} from '../repo/participations';
import {
  countPendingSubmissions,
  deleteQuest,
  getQuest,
  listQuests,
  putQuest,
  updateQuestFields,
} from '../repo/quests';
import {
  countChallengeVerificationsByQuest,
  findChallengeVerificationById,
  listParticipantDayVerifications,
  listParticipantVerifications,
  updateVerificationFields,
} from '../repo/verifications';
import {
  findProposalById,
  listChallengeProposals,
  updateProposalReview,
  updateProposalReReject,
} from '../repo/quest-proposals';
import {
  findCompletionRequestById,
  listChallengeCompletionRequests,
  updateCompletionRequestReview,
} from '../repo/completion-requests';
import { canRerejectProposal, canReviewProposal, proposalReviewOutcome } from '../domain/proposal-rules';
import {
  createLeaderQuestSchema,
  updateLeaderQuestSchema,
  proposalReviewSchema,
  proposalReRejectSchema,
  completionResolveSchema,
} from '../schemas';
import { stripKeys } from '../repo/shared';

export const leaderRoutes = new Hono<AppEnv>();

interface LeaderGuardResult {
  error?: Response;
  challenge?: Record<string, any>;
}

/**
 * 리더 가드 — 기본은 리더 + 매니저(challenge.managerIds) 허용.
 * 파괴적 액션(퀘스트 삭제 등)은 { leaderOnly: true }로 리더만 통과시킨다.
 */
async function requireLeaderChallenge(
  c: ApiContext,
  challengeId: string,
  opts?: { leaderOnly?: boolean },
): Promise<LeaderGuardResult> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) return { error: fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다') };
  const ownerId = challenge.createdBy || challenge.creatorId || challenge.leaderId;
  const { userId } = c.get('authUser')!;
  const isOwner = Boolean(ownerId) && ownerId === userId;
  const managerIds: string[] = Array.isArray(challenge.managerIds) ? challenge.managerIds.map(String) : [];
  const isManager = !opts?.leaderOnly && managerIds.includes(userId);
  if (!isOwner && !isManager) {
    return {
      error: fail(
        c, 403, 'FORBIDDEN',
        opts?.leaderOnly ? '챌린지 리더만 사용할 수 있는 기능입니다' : '챌린지 리더·매니저만 사용할 수 있는 기능입니다',
      ),
    };
  }
  return { challenge };
}

/**
 * 리더퀘스트 변경(삭제·중단)으로 요구 개수가 줄었을 때, 지나간 날짜의 완료·점수를 재계산한다.
 * '상향(upgrade)만' — 이미 성공한 날은 유지하고, 미완료였던 날이 이제 조건을 충족하면 성공/1점으로 올린다.
 * (요구 개수가 줄어드는 이벤트에서만 호출하므로 점수를 깎지 않는다.)
 */
async function recomputeProgressUpgradeOnly(challenge: Record<string, any>, challengeId: string): Promise<void> {
  const challengeType = String(challenge.challengeType || 'leader_personal');
  const quests = await listQuests(challengeId);
  const totalLeaderQuestIds = quests
    .filter((q) => q.status === 'active' && q.questScope !== 'personal')
    .map((q) => String(q.questId));
  const activeLeaderSet = new Set(totalLeaderQuestIds);
  const rules = createDayCompletionRules({ challengeType, totalLeaderQuestIds, leaderQuestsFetched: true });

  const members = await listChallengeParticipations(challengeId);
  const nowIso = new Date().toISOString();
  for (const m of members) {
    const userId = String(m.userId ?? '');
    if (!userId) continue;
    const progress = normalizeProgress(m.progress);
    const durationDays = resolveDurationDays(challenge.durationDays, progress);
    let changed = false;

    const updated = progress.map((dp: any) => {
      // 삭제/중단된 리더퀘스트 id 제거 + leaderQuestDone 재계산
      const prunedIds = Array.isArray(dp.leaderQuestIds)
        ? dp.leaderQuestIds.filter((id: string) => activeLeaderSet.has(id))
        : [];
      const next: any = { ...dp, leaderQuestIds: prunedIds };
      next.leaderQuestDone = rules.isLeaderAllDone(next);
      if (
        JSON.stringify(prunedIds) !== JSON.stringify(dp.leaderQuestIds ?? []) ||
        next.leaderQuestDone !== dp.leaderQuestDone
      ) {
        changed = true;
      }
      // 이미 성공한 날·리더가 명시적으로 미완 처리한 날은 유지. 그 외 미완료였던 날이 조건 충족 시 상향.
      if (dp.status !== 'success' && dp.leaderForcedIncomplete !== true) {
        const attempted =
          prunedIds.length > 0 ||
          next.personalQuestDone === true ||
          Boolean(next.verificationId || next.leaderVerificationId || next.personalVerificationId) ||
          dp.status === 'partial';
        if (attempted && rules.isDayComplete(next)) {
          next.status = 'success';
          next.score = 1;
          changed = true;
        }
      }
      return next;
    });

    if (!changed) continue;
    const totalScore = updated
      .filter((p: any) => p.status === 'success')
      .reduce((s: number, p: any) => s + (Number(p.score) || 0), 0);
    let consecutive = 0;
    for (let d = 1; d <= durationDays; d += 1) {
      const e = updated.find((p: any) => Number(p.day) === d);
      if (e && e.status === 'success') consecutive += 1;
      else break;
    }
    await updateParticipationFields(challengeId, userId, {
      progress: updated,
      score: totalScore,
      consecutiveDays: consecutive,
      updatedAt: nowIso,
    });
  }
}

// 오늘의 리더 브리핑
leaderRoutes.get('/briefing', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const challenge = guard.challenge!;

  const nowIso = new Date().toISOString();
  const timezone = safeTimezone(c.req.header('x-user-timezone'));
  const today = certDateFromIso(nowIso, timezone);
  const durationDays = resolveDurationDays(challenge.durationDays, undefined);

  // 오늘 day — @chum7/core 캘린더 계산 (currentDay 저장값 사용 금지)
  const startDate = typeof challenge.challengeStartAt === 'string'
    ? certDateFromIso(challenge.challengeStartAt, timezone)
    : today;
  const day = calendarDay(startDate, today, durationDays);

  // 리더 퀘스트 목록 → challengeType 완료 판정 룰
  let totalLeaderQuestIds: string[] = [];
  let leaderQuestsFetched = false;
  try {
    const quests = await listQuests(challengeId);
    totalLeaderQuestIds = quests
      .filter((q) => q.status === 'active' && q.questScope !== 'personal')
      .map((q) => q.questId as string);
    leaderQuestsFetched = true;
  } catch {
    // 폴백: boolean 판정
  }
  const rules = createDayCompletionRules({
    challengeType: typeof challenge.challengeType === 'string' ? challenge.challengeType : 'leader_personal',
    totalLeaderQuestIds,
    leaderQuestsFetched,
  });

  const participants = await listChallengeParticipations(challengeId);
  const activeParticipants = participants.filter((p) => p.status === 'active');

  const incompleteUsers: Array<Record<string, unknown>> = [];
  let verifiedCount = 0;
  for (const p of activeParticipants) {
    const progress = normalizeProgress(p.progress);
    const todayEntry = progress.find((entry) => Number(entry.day) === day);
    if (rules.isDayComplete(todayEntry)) {
      verifiedCount += 1;
    } else {
      incompleteUsers.push({
        userId: p.userId,
        userChallengeId: p.userChallengeId,
        personalGoal: p.personalGoal ?? null,
        consecutiveDays: p.consecutiveDays ?? 0,
        status: todayEntry?.status ?? null,
      });
    }
  }

  const totalActive = activeParticipants.length;
  const pendingQuestSubmissions = await countPendingSubmissions(challengeId);

  return ok(c, {
    challengeId,
    day,
    date: today,
    verifiedCount,
    totalActive,
    verificationRate: totalActive > 0 ? Math.round((verifiedCount / totalActive) * 1000) / 10 : 0,
    incompleteUsers,
    incompleteCount: incompleteUsers.length,
    pendingQuestSubmissions,
  }, `오늘 인증 ${verifiedCount}/${totalActive}명 완료`);
});

// 참여자 목록 (진행률 포함)
leaderRoutes.get('/participants', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const challenge = guard.challenge!;

  const nowIso = new Date().toISOString();
  const participants = await listChallengeParticipations(challengeId);

  const enriched = participants.map((p) => {
    const durationDays = resolveDurationDays(challenge.durationDays, p.progress);
    const progressList = normalizeProgress(p.progress);
    const completedDays = progressList.filter((entry) => isCompletedProgressStatus(entry.status)).length;
    const progressPercentage = Math.max(0, Math.min(100, Math.round((completedDays / durationDays) * 100)));
    const effectiveCurrentDay = calculateEffectiveCurrentDay(
      { ...p, challengeStartAt: challenge.challengeStartAt },
      nowIso,
      durationDays,
    );

    // 그리드용 일자별 상태 (success/partial/none + 리더 수동인정 여부)
    const days = Array.from({ length: durationDays }, (_, i) => {
      const d = i + 1;
      const rec = progressList.find((e: any) => Number(e.day) === d) as any;
      return {
        day: d,
        status: (rec?.status as string) ?? 'none',
        granted: rec?.leaderGrantedComplete === true,
      };
    });

    return {
      userChallengeId: p.userChallengeId,
      userId: p.userId,
      status: p.status,
      phase: p.phase,
      joinStatus: p.joinStatus ?? null,
      startDate: p.startDate ?? null,
      currentDay: effectiveCurrentDay,
      durationDays,
      days,
      completedDays,
      progressPercentage,
      score: p.score ?? 0,
      cheerScore: p.cheerScore ?? 0,
      thankScore: p.thankScore ?? 0,
      consecutiveDays: p.consecutiveDays ?? 0,
      personalGoal: p.personalGoal ?? null,
      personalTarget: p.personalTarget ?? null,
      usedRemedyCount: progressList.filter((entry) => entry.remedied === true).length,
      joinedAt: p.createdAt ?? null,
      gaveUpAt: p.gaveUpAt ?? null,
    };
  });

  return ok(c, {
    participants: enriched,
    total: enriched.length,
    summary: {
      active: enriched.filter((p) => p.status === 'active').length,
      pending: enriched.filter((p) => p.status === 'pending').length,
      completed: enriched.filter((p) => p.status === 'completed').length,
      failed: enriched.filter((p) => p.status === 'failed').length,
      gaveUp: enriched.filter((p) => p.status === 'gave_up').length,
    },
  });
});

// 공통 리더퀘스트 등록 (리더 — 전체 참여자 공통 퀘스트를 운영탭에서 추가)
leaderRoutes.post('/quests', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const challenge = guard.challenge!;
  const { userId } = c.get('authUser')!;

  const input = createLeaderQuestSchema.parse(await c.req.json().catch(() => ({})));

  // 챌린지 허용 인증 방식과 교차 검증 (admin 생성 규칙 승계)
  const challengeAllowedTypes: string[] = Array.isArray(challenge.allowedVerificationTypes)
    ? challenge.allowedVerificationTypes
    : ['image', 'video', 'link', 'text'];
  const questAllowedTypes = input.allowedVerificationTypes ?? challengeAllowedTypes;
  if (!questAllowedTypes.every((t) => challengeAllowedTypes.includes(t))) {
    return fail(c, 400, 'INVALID_VERIFICATION_TYPES',
      `이 챌린지에서 허용되지 않는 인증 방식입니다. 허용: ${challengeAllowedTypes.join(', ')}`);
  }

  // 노출 순서 — 기존 리더(비개인) 퀘스트 수를 뒤에 붙인다 (조회 실패는 0으로 폴백)
  let leaderCount = 0;
  try {
    const existing = await listQuests(challengeId);
    leaderCount = existing.filter((q) => q.questScope !== 'personal').length;
  } catch (err: any) {
    console.warn('listQuests for displayOrder failed (non-fatal):', err?.message);
  }

  const questId = randomUUID();
  const now = new Date().toISOString();
  const quest = {
    questId,
    title: input.title,
    description: input.description,
    challengeId,
    allowedVerificationTypes: questAllowedTypes,
    verificationType: questAllowedTypes[0],
    verificationGuide: input.verificationGuide?.trim() || input.description,
    verificationConfig: {},
    rewardPoints: input.rewardPoints,
    rewardBadgeId: null,
    startAt: now,
    endAt: null,
    approvalRequired: input.approvalRequired,
    displayOrder: leaderCount,
    exposureOrder: leaderCount,
    questLayer: 'A',
    questScope: 'leader',
    requireOnJoinInput: false,
    startDay: null,
    endDay: null,
    revealAt: null,
    ...(input.targetTime ? { targetTime: input.targetTime } : {}),
    status: 'active',
    submissionCount: 0,
    approvedCount: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };

  await putQuest(challengeId, quest);
  return ok(c, quest, '공통 리더퀘스트가 등록됐어요', 201);
});

// 리더퀘스트 수정 / 중단·재개 (리더 — status='inactive'면 중단, 'active'면 재개)
leaderRoutes.put('/quests/:questId', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const questId = c.req.param('questId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const challenge = guard.challenge!;

  const existing = await getQuest(challengeId, questId);
  if (!existing || existing.questScope === 'personal') {
    return fail(c, 404, 'QUEST_NOT_FOUND', '리더퀘스트를 찾을 수 없습니다');
  }

  const input = updateLeaderQuestSchema.parse(await c.req.json().catch(() => ({})));

  const patch: Record<string, any> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.verificationGuide !== undefined) patch.verificationGuide = input.verificationGuide.trim();
  if (input.approvalRequired !== undefined) patch.approvalRequired = input.approvalRequired;
  if (input.rewardPoints !== undefined) patch.rewardPoints = input.rewardPoints;
  if (input.targetTime !== undefined) patch.targetTime = input.targetTime;
  if (input.status !== undefined) patch.status = input.status;

  // 인증 방식 변경 시 챌린지 허용범위 교차검증 + 대표 verificationType 재설정
  if (input.allowedVerificationTypes !== undefined) {
    const challengeAllowedTypes: string[] = Array.isArray(challenge.allowedVerificationTypes)
      ? challenge.allowedVerificationTypes
      : ['image', 'video', 'link', 'text'];
    if (!input.allowedVerificationTypes.every((t) => challengeAllowedTypes.includes(t))) {
      return fail(c, 400, 'INVALID_VERIFICATION_TYPES',
        `이 챌린지에서 허용되지 않는 인증 방식입니다. 허용: ${challengeAllowedTypes.join(', ')}`);
    }
    patch.allowedVerificationTypes = input.allowedVerificationTypes;
    patch.verificationType = input.allowedVerificationTypes[0];
  }

  patch.updatedAt = new Date().toISOString();
  const okUpdate = await updateQuestFields(challengeId, questId, patch);
  if (!okUpdate) return fail(c, 404, 'QUEST_NOT_FOUND', '리더퀘스트를 찾을 수 없습니다');

  // 중단(active→inactive)으로 요구 리더퀘스트 개수가 줄면 지나간 날짜 완료·점수 재계산(상향만)
  if (input.status === 'inactive' && existing.status === 'active') {
    try {
      await recomputeProgressUpgradeOnly(challenge, challengeId);
    } catch (err: any) {
      console.error('stop quest: progress recompute error (non-fatal):', err?.message);
    }
  }

  const updated = await getQuest(challengeId, questId);
  const msg = input.status === 'inactive' ? '리더퀘스트를 중단했어요 (지난 날짜 완료·점수 재계산)'
    : input.status === 'active' ? '리더퀘스트를 재개했어요'
    : '리더퀘스트를 수정했어요';
  return ok(c, updated ? stripKeys(updated) : null, msg);
});

// 리더퀘스트 삭제 (리더 전용 — 파괴적. 매니저는 '중단'까지만)
leaderRoutes.delete('/quests/:questId', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const questId = c.req.param('questId')!;
  const guard = await requireLeaderChallenge(c, challengeId, { leaderOnly: true });
  if (guard.error) return guard.error;

  const existing = await getQuest(challengeId, questId);
  if (!existing || existing.questScope === 'personal') {
    return fail(c, 404, 'QUEST_NOT_FOUND', '리더퀘스트를 찾을 수 없습니다');
  }

  // 인증게시물이 연결돼 있으면 삭제 불가 — 이동/중단 안내
  const vfCount = await countChallengeVerificationsByQuest(challengeId, questId);
  if (vfCount > 0) {
    return fail(
      c,
      409,
      'QUEST_HAS_VERIFICATIONS',
      `이 퀘스트에 인증 ${vfCount}건이 연결돼 있어 삭제할 수 없어요. 인증을 다른 퀘스트로 옮기거나 '중단'하세요.`,
    );
  }

  await deleteQuest(challengeId, questId);

  // 요구 리더퀘스트 개수가 줄었으니 지나간 날짜 완료·점수 재계산(상향만)
  try {
    await recomputeProgressUpgradeOnly(guard.challenge!, challengeId);
  } catch (err: any) {
    console.error('delete quest: progress recompute error (non-fatal):', err?.message);
  }

  return ok(c, { questId, deleted: true }, '리더퀘스트를 삭제했어요. 지난 날짜 완료·점수를 다시 계산했어요.');
});

// 리더퀘스트 목록 (관리용) — 상태 무관 + 각 퀘스트에 실제 인증(questId 연결) 수 포함
leaderRoutes.get('/quests', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;

  const quests = (await listQuests(challengeId)).filter((q) => q.questScope !== 'personal');
  const withCounts = await Promise.all(
    quests.map(async (q) => ({
      ...stripKeys(q),
      verificationCount: await countChallengeVerificationsByQuest(challengeId, q.questId),
    })),
  );
  withCounts.sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  return ok(c, { quests: withCounts });
});

// 개인 퀘스트 제안 심사 목록 (리더 — 기본 pending, status=all 지원)
leaderRoutes.get('/quest-proposals', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;

  const status = (c.req.query('status') ?? 'pending').trim();
  const proposals = (await listChallengeProposals(challengeId))
    .filter((item) => (status === 'all' ? true : item.status === status))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    .map(stripKeys);

  return ok(c, { proposals, total: proposals.length });
});

// 개인 퀘스트 제안 심사 (리더 — 승인/반려, admin-api 와 동일 규칙)
leaderRoutes.put('/quest-proposals/:proposalId/review', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const proposalId = c.req.param('proposalId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;

  const input = proposalReviewSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date();

  const proposal = await findProposalById(challengeId, proposalId);
  if (!proposal) return fail(c, 404, 'PROPOSAL_NOT_FOUND', '제안서를 찾을 수 없습니다');
  if (!canReviewProposal(proposal.status)) {
    return fail(c, 409, 'ALREADY_REVIEWED', `이미 처리된 제안서입니다 (status: ${proposal.status})`);
  }

  const outcome = proposalReviewOutcome(input.decision);
  const applied = await updateProposalReview({
    challengeId,
    sk: String(proposal.sk),
    status: outcome.status,
    reason: input.reason ?? null,
    reviewerId: c.get('authUser')!.userId,
    nowIso: now.toISOString(),
  });
  if (!applied) return fail(c, 409, 'ALREADY_REVIEWED', '이미 처리된 제안서입니다');

  return ok(c, { proposalId, status: outcome.status }, outcome.message);
});

// 개인 퀘스트 제안 재반려 (리더 — 이미 승인/자동승인된 '제안(퀘스트 정의)'을 다시 반려).
// 제안 상태만 rejected 로 되돌려 참여자가 재제출하게 한다. 개별 인증 게시물은 건드리지 않는다
// (게시물 단위 반려는 아래 /verifications/:id/reject 사용).
leaderRoutes.put('/quest-proposals/:proposalId/re-reject', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const proposalId = c.req.param('proposalId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;

  const input = proposalReRejectSchema.parse(await c.req.json().catch(() => ({})));
  const nowIso = new Date().toISOString();

  const proposal = await findProposalById(challengeId, proposalId);
  if (!proposal) return fail(c, 404, 'PROPOSAL_NOT_FOUND', '제안서를 찾을 수 없습니다');
  if (!canRerejectProposal(proposal.status)) {
    return fail(c, 409, 'NOT_APPROVED', `이미 승인된 제안만 다시 반려할 수 있습니다 (status: ${proposal.status})`);
  }

  const applied = await updateProposalReReject({
    challengeId,
    sk: String(proposal.sk),
    reason: input.reason ?? null,
    fallback: input.fallback,
    // 재제출 미이행 시 복원용 — 현재(승인) 내용 스냅샷
    originalTitle: typeof proposal.title === 'string' ? proposal.title : null,
    originalDescription: typeof proposal.description === 'string' ? proposal.description : null,
    reviewerId: c.get('authUser')!.userId,
    nowIso,
  });
  if (!applied) return fail(c, 409, 'NOT_APPROVED', '이미 처리된 제안서입니다');

  // 참여자에게 사유·결과 안내 (재제출 유도)
  try {
    await publishEvent('proposal.rerejected', {
      challengeId,
      userId: String(proposal.userId),
      proposalId,
      reason: input.reason ?? '',
      fallback: input.fallback,
    });
  } catch (err: any) {
    console.error('re-reject: publish event error (non-fatal):', err?.message);
  }

  return ok(
    c,
    { proposalId, status: 'rejected', fallback: input.fallback },
    '개인 퀘스트 제안을 반려했어요. 참여자가 시작 전까지 다시 제출할 수 있어요.',
  );
});

// 인증 게시물(1건) 반려 (리더 — 특정 인증을 그날 단위로 반려).
//  - 챌린지/공개 피드·마당에서 숨김: isPublic='false' + gsi2 키 제거(공개 인덱스 이탈) + 점수 0
//  - 본인 기록(gsi1 VFUSER#)은 그대로 유지 → 개인 피드/기록에는 남음
//  - 해당 날짜의 완료/점수 되돌리고 참여자 집계(score·consecutiveDays) 재계산
//  - 마당(plaza) 변환분 정리는 verification.rejected 이벤트로 위임
leaderRoutes.put('/verifications/:verificationId/reject', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const verificationId = c.req.param('verificationId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const challenge = guard.challenge!;

  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null;
  const nowIso = new Date().toISOString();

  const vf = await findChallengeVerificationById(challengeId, verificationId);
  if (!vf) return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');
  if (vf.rejectedByLeader === true) return fail(c, 409, 'ALREADY_REJECTED', '이미 반려된 인증입니다');

  const participantId = String(vf.userId);
  const day = Number(vf.day);
  const questType = String(vf.questType ?? '');

  // 1) 인증 아이템 — 공개 피드/마당에서 제거(gsi2 삭제) + 비공개 + 점수 0 + 반려 표시. gsi1(기록)은 유지.
  await updateVerificationFields(
    { pk: String(vf.pk), sk: String(vf.sk) },
    {
      isPublic: 'false',
      isPersonalOnly: true,
      rejectedByLeader: true,
      rejectedAt: nowIso,
      rejectedBy: c.get('authUser')!.userId,
      rejectReason: reason,
      score: 0,
      scoreEarned: 0,
      updatedAt: nowIso,
    },
    ['gsi2pk', 'gsi2sk'],
  );

  // 2) 진행 기록 — 해당 day 완료/점수 되돌리기 + 참여자 집계 재계산 (실패해도 반려는 성공 처리)
  try {
    const participation = await getParticipation(challengeId, participantId);
    if (participation) {
      const progress = normalizeProgress(participation.progress);
      const durationDays = resolveDurationDays(challenge.durationDays, progress);
      const updated = progress.map((entry: any) => {
        if (Number(entry.day) !== day) return entry;
        const next: any = { ...entry };
        if (questType === 'personal') { next.personalQuestDone = false; delete next.personalVerificationId; }
        else if (questType === 'leader') { next.leaderQuestDone = false; delete next.leaderVerificationId; }
        if (next.verificationId === verificationId) delete next.verificationId;
        if (isCompletedProgressStatus(entry.status)) { next.status = 'partial'; next.score = 0; }
        return next;
      });
      const totalScore = updated
        .filter((p: any) => p.status === 'success')
        .reduce((s: number, p: any) => s + (Number(p.score) || 0), 0);
      let consecutive = 0;
      for (let d = 1; d <= durationDays; d += 1) {
        const e = updated.find((p: any) => Number(p.day) === d);
        if (e && e.status === 'success') consecutive += 1;
        else break;
      }
      await updateParticipationFields(challengeId, participantId, {
        progress: updated,
        score: totalScore,
        consecutiveDays: consecutive,
        updatedAt: nowIso,
      });
    }
  } catch (err: any) {
    console.error('reject verification: progress recompute error (non-fatal):', err?.message);
  }

  // 3) 마당(plaza) 변환분 정리 — 소비자가 POST#courtyard-<verificationId> 비활성화 (이벤트 위임)
  try {
    await publishEvent('verification.rejected', {
      verificationId,
      challengeId,
      userId: participantId,
      day,
      plazaConverted: Boolean(vf.plazaConvertedAt),
    });
  } catch (err: any) {
    console.error('reject verification: publish event error (non-fatal):', err?.message);
  }

  return ok(
    c,
    { verificationId, rejected: true },
    '인증을 반려했어요. 챌린지·공개 피드에서 숨겨지고 본인 기록에는 남습니다.',
  );
});

// 인증을 다른 리더퀘스트로 이동 — 사용자가 잘못된 퀘스트에 올린 인증을 재배정. 점수(일자 기반)는 유지.
leaderRoutes.put('/verifications/:verificationId/move-quest', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const verificationId = c.req.param('verificationId');
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;

  const body = await c.req.json().catch(() => ({} as any));
  const toQuestId = String(body.toQuestId || '');
  if (!toQuestId) return fail(c, 400, 'VALIDATION_ERROR', '이동할 퀘스트(toQuestId)가 필요합니다');

  const vf = await findChallengeVerificationById(challengeId, verificationId);
  if (!vf) return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');
  if (String(vf.questType ?? '') !== 'leader') {
    return fail(c, 400, 'NOT_LEADER_VERIFICATION', '리더퀘스트 인증만 이동할 수 있어요');
  }

  const target = await getQuest(challengeId, toQuestId);
  if (!target || target.questScope === 'personal') {
    return fail(c, 404, 'QUEST_NOT_FOUND', '이동할 리더퀘스트를 찾을 수 없습니다');
  }

  const fromQuestId = String(vf.questId ?? '');
  if (fromQuestId === toQuestId) return ok(c, { verificationId, questId: toQuestId }, '이미 해당 퀘스트예요');

  const nowIso = new Date().toISOString();
  const day = Number(vf.day);
  const participantId = String(vf.userId ?? '');

  // 1) 인증 아이템 — questId 재배정 (questType='leader' 유지, 점수·공개상태 불변 → 점수 유지)
  await updateVerificationFields(
    { pk: String(vf.pk), sk: String(vf.sk) },
    { questId: toQuestId, questType: 'leader', updatedAt: nowIso },
  );

  // 2) 진행 기록 — 해당 day의 leaderQuestIds에서 원 questId 제거 + 대상 questId 추가(중복 제거).
  //    점수/status/연속일은 건드리지 않는다(일자 기반 점수 유지).
  try {
    const participation = await getParticipation(challengeId, participantId);
    if (participation) {
      const progress = normalizeProgress(participation.progress);
      let totalLeaderQuests = 0;
      try {
        const quests = await listQuests(challengeId);
        totalLeaderQuests = quests.filter((q) => q.questScope !== 'personal' && q.status === 'active').length;
      } catch { /* 조회 실패는 leaderQuestDone 재계산만 생략 */ }
      const updated = progress.map((entry: any) => {
        if (Number(entry.day) !== day) return entry;
        const ids: string[] = Array.isArray(entry.leaderQuestIds) ? entry.leaderQuestIds : [];
        const nextIds = ids.filter((id) => id !== fromQuestId && id !== toQuestId);
        nextIds.push(toQuestId);
        const next: any = { ...entry, leaderQuestIds: nextIds };
        if (totalLeaderQuests > 0) next.leaderQuestDone = nextIds.length >= totalLeaderQuests;
        return next;
      });
      await updateParticipationFields(challengeId, participantId, { progress: updated, updatedAt: nowIso });
    }
  } catch (err: any) {
    console.error('move-quest: progress update error (non-fatal):', err?.message);
  }

  return ok(c, { verificationId, questId: toQuestId }, '인증을 다른 퀘스트로 옮겼어요');
});

// ── 완료 인정(수동 완료) 공용 로직 — 게시물 단위 / 참여자×날짜 그리드 단위 공유 ──

function recomputeTotals(updated: any[], durationDays: number) {
  const totalScore = updated
    .filter((p: any) => p.status === 'success')
    .reduce((s: number, p: any) => s + (Number(p.score) || 0), 0);
  let consecutive = 0;
  for (let d = 1; d <= durationDays; d += 1) {
    const e = updated.find((p: any) => Number(p.day) === d);
    if (e && e.status === 'success') consecutive += 1;
    else break;
  }
  return { totalScore, consecutive };
}

/** 해당 참여자의 특정 day를 수동 완료(성공·1점) 처리 */
async function grantDayComplete(
  challenge: Record<string, any>,
  challengeId: string,
  participantId: string,
  day: number,
  leaderId: string,
  opts?: { questId?: string | null; verificationId?: string | null },
): Promise<{ ok: boolean; code?: string }> {
  const participation = await getParticipation(challengeId, participantId);
  if (!participation) return { ok: false, code: 'PARTICIPATION_NOT_FOUND' };
  const nowIso = new Date().toISOString();
  const progress = normalizeProgress(participation.progress);
  const durationDays = resolveDurationDays(challenge.durationDays, progress);

  let found = false;
  const updated = progress.map((entry: any) => {
    if (Number(entry.day) !== day) return entry;
    found = true;
    const ids: string[] = Array.isArray(entry.leaderQuestIds) ? [...entry.leaderQuestIds] : [];
    if (opts?.questId && !ids.includes(String(opts.questId))) ids.push(String(opts.questId));
    return {
      ...entry,
      status: 'success',
      score: 1,
      leaderQuestIds: ids,
      leaderQuestDone: true,
      leaderGrantedComplete: true,
      grantedBy: leaderId,
      grantedAt: nowIso,
      ...(opts?.verificationId ? { verificationId: entry.verificationId ?? opts.verificationId } : {}),
    };
  });
  if (!found) {
    updated.push({
      day,
      status: 'success',
      score: 1,
      leaderQuestIds: opts?.questId ? [String(opts.questId)] : [],
      leaderQuestDone: true,
      leaderGrantedComplete: true,
      grantedBy: leaderId,
      grantedAt: nowIso,
      ...(opts?.verificationId ? { verificationId: opts.verificationId } : {}),
    } as any);
  }

  const { totalScore, consecutive } = recomputeTotals(updated, durationDays);
  await updateParticipationFields(challengeId, participantId, {
    progress: updated,
    score: totalScore,
    consecutiveDays: consecutive,
    updatedAt: nowIso,
  });
  return { ok: true };
}

/** 수동 완료 해제 후 현재 활성 리더퀘스트 규칙으로 해당 day 재판정 */
async function revokeDayComplete(
  challenge: Record<string, any>,
  challengeId: string,
  participantId: string,
  day: number,
): Promise<{ ok: boolean; code?: string }> {
  const participation = await getParticipation(challengeId, participantId);
  if (!participation) return { ok: false, code: 'PARTICIPATION_NOT_FOUND' };

  const challengeType = String(challenge.challengeType || 'leader_personal');
  const quests = await listQuests(challengeId);
  const totalLeaderQuestIds = quests
    .filter((q) => q.status === 'active' && q.questScope !== 'personal')
    .map((q) => String(q.questId));
  const rules = createDayCompletionRules({ challengeType, totalLeaderQuestIds, leaderQuestsFetched: true });

  const nowIso = new Date().toISOString();
  const progress = normalizeProgress(participation.progress);
  const durationDays = resolveDurationDays(challenge.durationDays, progress);
  const updated = progress.map((entry: any) => {
    if (Number(entry.day) !== day) return entry;
    const next: any = { ...entry };
    delete next.leaderGrantedComplete;
    delete next.grantedBy;
    delete next.grantedAt;
    const complete = rules.isDayComplete(next);
    next.status = complete ? 'success' : 'partial';
    next.score = complete ? 1 : 0;
    return next;
  });

  const { totalScore, consecutive } = recomputeTotals(updated, durationDays);
  await updateParticipationFields(challengeId, participantId, {
    progress: updated,
    score: totalScore,
    consecutiveDays: consecutive,
    updatedAt: nowIso,
  });
  return { ok: true };
}

/** 그리드 3단계 상태 지정 — complete(성공·1점) / partial(일부·0점) / none(미완·취소·0점) */
async function setDayState(
  challenge: Record<string, any>,
  challengeId: string,
  participantId: string,
  day: number,
  state: 'complete' | 'partial' | 'none',
  leaderId: string,
): Promise<{ ok: boolean; code?: string }> {
  if (state === 'complete') {
    return grantDayComplete(challenge, challengeId, participantId, day, leaderId);
  }
  const participation = await getParticipation(challengeId, participantId);
  if (!participation) return { ok: false, code: 'PARTICIPATION_NOT_FOUND' };
  const nowIso = new Date().toISOString();
  const progress = normalizeProgress(participation.progress);
  const durationDays = resolveDurationDays(challenge.durationDays, progress);

  let found = false;
  const updated = progress.map((entry: any) => {
    if (Number(entry.day) !== day) return entry;
    found = true;
    const next: any = { ...entry, status: state === 'partial' ? 'partial' : 'none', score: 0 };
    delete next.leaderGrantedComplete;
    delete next.grantedBy;
    delete next.grantedAt;
    // 취소(none)는 리더가 명시적으로 미완 처리 → 자동 재계산이 다시 올리지 않도록 플래그
    if (state === 'none') next.leaderForcedIncomplete = true;
    else delete next.leaderForcedIncomplete;
    return next;
  });
  if (!found) {
    updated.push({
      day,
      status: state === 'partial' ? 'partial' : 'none',
      score: 0,
      ...(state === 'none' ? { leaderForcedIncomplete: true } : {}),
    } as any);
  }

  const { totalScore, consecutive } = recomputeTotals(updated, durationDays);
  await updateParticipationFields(challengeId, participantId, {
    progress: updated,
    score: totalScore,
    consecutiveDays: consecutive,
    updatedAt: nowIso,
  });
  return { ok: true };
}

// 게시물별 '완료 인정' — 규칙상 자동 완료가 안 잡힌 날을 리더가 수동으로 완료 처리.
leaderRoutes.put('/verifications/:verificationId/grant-complete', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const verificationId = c.req.param('verificationId');
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const { userId: leaderId } = c.get('authUser')!;

  const vf = await findChallengeVerificationById(challengeId, verificationId);
  if (!vf) return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');
  const day = Number(vf.day);
  const r = await grantDayComplete(guard.challenge!, challengeId, String(vf.userId ?? ''), day, leaderId, {
    questId: vf.questId ? String(vf.questId) : null,
    verificationId,
  });
  if (!r.ok) return fail(c, 404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없습니다');
  return ok(c, { verificationId, day, granted: true }, `${day}일차를 완료 인정했어요 (+1점)`);
});

leaderRoutes.put('/verifications/:verificationId/revoke-complete', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const verificationId = c.req.param('verificationId');
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;

  const vf = await findChallengeVerificationById(challengeId, verificationId);
  if (!vf) return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');
  const r = await revokeDayComplete(guard.challenge!, challengeId, String(vf.userId ?? ''), Number(vf.day));
  if (!r.ok) return fail(c, 404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없습니다');
  return ok(c, { verificationId, day: Number(vf.day), granted: false }, '완료 인정을 취소했어요');
});

// 참여자×날짜 그리드 완료 인정/취소 — 게시물 없이도 특정 참여자의 특정 day를 직접 처리
leaderRoutes.put('/participants/:participantId/days/:day/grant', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const participantId = c.req.param('participantId')!;
  const day = Number(c.req.param('day'));
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const { userId: leaderId } = c.get('authUser')!;
  if (!Number.isFinite(day) || day < 1) return fail(c, 400, 'INVALID_DAY', '유효한 day가 필요합니다');

  const r = await grantDayComplete(guard.challenge!, challengeId, participantId, day, leaderId);
  if (!r.ok) return fail(c, 404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없습니다');
  return ok(c, { participantId, day, granted: true }, `${day}일차를 완료 인정했어요 (+1점)`);
});

leaderRoutes.put('/participants/:participantId/days/:day/revoke', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const participantId = c.req.param('participantId')!;
  const day = Number(c.req.param('day'));
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  if (!Number.isFinite(day) || day < 1) return fail(c, 400, 'INVALID_DAY', '유효한 day가 필요합니다');

  const r = await revokeDayComplete(guard.challenge!, challengeId, participantId, day);
  if (!r.ok) return fail(c, 404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없습니다');
  return ok(c, { participantId, day, granted: false }, '완료 인정을 취소했어요');
});

// 그리드 3단계 상태 지정 — body {state:'complete'|'partial'|'none'}
leaderRoutes.put('/participants/:participantId/days/:day/set-state', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const participantId = c.req.param('participantId')!;
  const day = Number(c.req.param('day'));
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const { userId: leaderId } = c.get('authUser')!;
  if (!Number.isFinite(day) || day < 1) return fail(c, 400, 'INVALID_DAY', '유효한 day가 필요합니다');

  const body = await c.req.json().catch(() => ({} as any));
  const state = body.state;
  if (state !== 'complete' && state !== 'partial' && state !== 'none') {
    return fail(c, 400, 'INVALID_STATE', 'state는 complete|partial|none 이어야 합니다');
  }
  const r = await setDayState(guard.challenge!, challengeId, participantId, day, state, leaderId);
  if (!r.ok) return fail(c, 404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없습니다');
  return ok(c, { participantId, day, state });
});

// ── 매니저 지정/해임 (리더 전용) ───────────────────────────────────────────
//  대상: 이 챌린지 참여 레코드 보유자(중도포기 제외). 최대 3명. 종료 후에도 유지(해임 전까지).
const MAX_MANAGERS = 3;

leaderRoutes.put('/managers', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const guard = await requireLeaderChallenge(c, challengeId, { leaderOnly: true });
  if (guard.error) return guard.error;
  const challenge = guard.challenge!;
  const { userId: leaderId } = c.get('authUser')!;

  const body = await c.req.json().catch(() => ({} as any));
  const targetUserId = String(body.userId ?? '');
  const action = body.action === 'remove' ? 'remove' : 'assign';
  if (!targetUserId) return fail(c, 400, 'VALIDATION_ERROR', '대상 userId가 필요합니다');
  if (targetUserId === leaderId) return fail(c, 409, 'LEADER_IS_ALREADY_OWNER', '리더 본인은 매니저로 지정할 수 없어요');

  const current: string[] = Array.isArray(challenge.managerIds) ? challenge.managerIds.map(String) : [];
  const nowIso = new Date().toISOString();

  if (action === 'assign') {
    if (current.includes(targetUserId)) return fail(c, 409, 'ALREADY_MANAGER', '이미 매니저예요');
    if (current.length >= MAX_MANAGERS) {
      return fail(c, 409, 'MANAGER_LIMIT', `매니저는 최대 ${MAX_MANAGERS}명까지 지정할 수 있어요`);
    }
    const participation = await getParticipation(challengeId, targetUserId);
    if (!participation) return fail(c, 404, 'NOT_A_PARTICIPANT', '이 챌린지에 참여 신청한 사람만 매니저로 지정할 수 있어요');
    if (participation.status === 'gave_up' || participation.phase === 'gave_up') {
      return fail(c, 409, 'PARTICIPANT_GAVE_UP', '중도 포기한 참여자는 매니저로 지정할 수 없어요');
    }
    const next = [...current, targetUserId];
    await updateChallengeFields(challengeId, { managerIds: next, updatedAt: nowIso });
    try {
      await publishEvent('manager.assigned', {
        challengeId, userId: targetUserId, leaderId,
        challengeTitle: typeof challenge.title === 'string' ? challenge.title : undefined,
      });
    } catch (err: any) {
      console.error('manager.assigned publish error (non-fatal):', err?.message);
    }
    return ok(c, { challengeId, managerIds: next }, '매니저로 지정했어요 🛡️');
  }

  if (!current.includes(targetUserId)) return fail(c, 404, 'NOT_A_MANAGER', '매니저가 아니에요');
  const next = current.filter((id) => id !== targetUserId);
  await updateChallengeFields(challengeId, { managerIds: next, updatedAt: nowIso });
  try {
    await publishEvent('manager.removed', {
      challengeId, userId: targetUserId, leaderId,
      challengeTitle: typeof challenge.title === 'string' ? challenge.title : undefined,
    });
  } catch (err: any) {
    console.error('manager.removed publish error (non-fatal):', err?.message);
  }
  return ok(c, { challengeId, managerIds: next }, '매니저를 해임했어요');
});

// 참가자 전체 인증 게시물 요약 — 일자별 썸네일·내용·인증시간 (리더/매니저 운영 그리드용)
leaderRoutes.get('/participants/:participantId/verifications', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const participantId = c.req.param('participantId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;

  const [items, quests] = await Promise.all([
    listParticipantVerifications(challengeId, participantId),
    listQuests(challengeId),
  ]);
  const questTitle = new Map(quests.map((q) => [String(q.questId), q.title as string]));
  const verifications = items
    .sort((a, b) => {
      const dayDiff = Number(a.day ?? 0) - Number(b.day ?? 0);
      if (dayDiff !== 0) return dayDiff;
      return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
    })
    .map((v) => ({
      verificationId: v.verificationId as string,
      day: typeof v.day === 'number' ? v.day : null,
      questId: (v.questId as string) ?? null,
      questType: (v.questType as string) ?? null,
      questTitle: v.questId ? questTitle.get(String(v.questId)) ?? null : null,
      verificationType: (v.verificationType as string) ?? 'text',
      imageUrl: (v.imageUrl as string) ?? null,
      todayNote: (v.todayNote as string) ?? null,
      performedAt: (v.performedAt as string) ?? (v.practiceAt as string) ?? null,
      createdAt: (v.createdAt as string) ?? null,
      isExtra: v.isExtra === true,
      scoreCancelled: v.scoreCancelled === true,
      rejectedByLeader: v.rejectedByLeader === true,
      hiddenByAdmin: v.hiddenByAdmin === true,
    }));
  return ok(c, { verifications, total: verifications.length });
});

// 참여자 특정 day의 인증 게시물 목록 — 그리드에서 '일부 기록이 있습니다' 확인용 (리뷰 후 처리)
leaderRoutes.get('/participants/:participantId/days/:day/verifications', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const participantId = c.req.param('participantId')!;
  const day = Number(c.req.param('day'));
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  if (!Number.isFinite(day) || day < 1) return fail(c, 400, 'INVALID_DAY', '유효한 day가 필요합니다');

  const [items, quests] = await Promise.all([
    listParticipantDayVerifications(challengeId, participantId, day),
    listQuests(challengeId),
  ]);
  const questTitle = new Map(quests.map((q) => [String(q.questId), q.title as string]));

  const verifications = items
    .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
    .map((v) => ({
      verificationId: v.verificationId as string,
      day: typeof v.day === 'number' ? v.day : day,
      questId: (v.questId as string) ?? null,
      questType: (v.questType as string) ?? null,
      questTitle: v.questId ? questTitle.get(String(v.questId)) ?? null : null,
      verificationType: (v.verificationType as string) ?? 'text',
      imageUrl: (v.imageUrl as string) ?? null,
      todayNote: (v.todayNote as string) ?? null,
      performedAt: (v.performedAt as string) ?? (v.practiceAt as string) ?? null,
      createdAt: (v.createdAt as string) ?? null,
      isPublic: v.isPublic === 'true' || v.isPublic === true,
      rejectedByLeader: v.rejectedByLeader === true,
      hiddenByAdmin: v.hiddenByAdmin === true,
    }));

  return ok(c, { verifications, total: verifications.length });
});

// 인증 완료 인정 요청 — 리더 심사 큐
leaderRoutes.get('/completion-requests', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const status = (c.req.query('status') ?? 'pending').trim();
  const requests = (await listChallengeCompletionRequests(challengeId))
    .filter((r) => (status === 'all' ? true : r.status === status))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .map(stripKeys);
  return ok(c, { requests, total: requests.length });
});

// 인증 완료 인정 요청 처리 — 승인 시 기존 grantDayComplete 재사용, 요청자에게 결과 알림
leaderRoutes.put('/completion-requests/:requestId', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const requestId = c.req.param('requestId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;
  const { userId: leaderId } = c.get('authUser')!;

  const input = completionResolveSchema.parse(await c.req.json().catch(() => ({})));
  const reqItem = await findCompletionRequestById(challengeId, requestId);
  if (!reqItem) return fail(c, 404, 'REQUEST_NOT_FOUND', '요청을 찾을 수 없습니다');
  if (reqItem.status !== 'pending') return fail(c, 409, 'ALREADY_RESOLVED', '이미 처리된 요청이에요');

  const requesterId = String(reqItem.userId ?? '');
  const day = Number(reqItem.day);

  if (input.decision === 'approve') {
    const r = await grantDayComplete(guard.challenge!, challengeId, requesterId, day, leaderId, {
      verificationId: reqItem.verificationId ? String(reqItem.verificationId) : null,
    });
    if (!r.ok) return fail(c, 404, 'PARTICIPATION_NOT_FOUND', '참여 정보를 찾을 수 없습니다');
  }

  const okReview = await updateCompletionRequestReview({
    challengeId,
    userId: requesterId,
    requestId,
    status: input.decision === 'approve' ? 'approved' : 'rejected',
    reviewerId: leaderId,
    feedback: input.feedback,
    nowIso: new Date().toISOString(),
  });
  if (!okReview) return fail(c, 409, 'ALREADY_RESOLVED', '이미 처리된 요청이에요');

  try {
    await publishEvent('completion.resolved', {
      challengeId,
      requestId,
      userId: requesterId,
      day,
      outcome: input.decision === 'approve' ? 'granted' : 'rejected',
    });
  } catch (err: any) {
    console.error('completion.resolved publish error (non-fatal):', err?.message);
  }

  return ok(c, { requestId, status: input.decision === 'approve' ? 'approved' : 'rejected' });
});
