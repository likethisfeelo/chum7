/**
 * 리더 운영 도구 v1 — /c/:challengeId/leader/...
 *  GET briefing     : 오늘 인증률 n/m + 미인증자 목록 + 대기 제출물 수 (UC#·QSUB# 아이템에서 계산)
 *  GET participants : 참여자 목록 (진행률 포함)
 * 리마인드 발송·메시지 템플릿·시즌 복제는 v2 — PORTING.md TODO 기록.
 */
import { Hono } from 'hono';
import type { AppEnv, ApiContext } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
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
import { getChallenge } from '../repo/challenges';
import {
  getParticipation,
  listChallengeParticipations,
  updateParticipationFields,
} from '../repo/participations';
import { countPendingSubmissions, listQuests } from '../repo/quests';
import {
  deleteVerification,
  listUserChallengeVerifications,
} from '../repo/verifications';
import {
  findProposalById,
  listChallengeProposals,
  updateProposalReview,
  updateProposalReReject,
} from '../repo/quest-proposals';
import { canRerejectProposal, canReviewProposal, proposalReviewOutcome } from '../domain/proposal-rules';
import { proposalReviewSchema } from '../schemas';
import { stripKeys } from '../repo/shared';

export const leaderRoutes = new Hono<AppEnv>();

interface LeaderGuardResult {
  error?: Response;
  challenge?: Record<string, any>;
}

async function requireLeaderChallenge(c: ApiContext, challengeId: string): Promise<LeaderGuardResult> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) return { error: fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다') };
  const ownerId = challenge.createdBy || challenge.creatorId || challenge.leaderId;
  const { userId } = c.get('authUser')!;
  if (!ownerId || ownerId !== userId) {
    return { error: fail(c, 403, 'FORBIDDEN', '챌린지 리더만 사용할 수 있는 기능입니다') };
  }
  return { challenge };
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

    return {
      userChallengeId: p.userChallengeId,
      userId: p.userId,
      status: p.status,
      phase: p.phase,
      joinStatus: p.joinStatus ?? null,
      startDate: p.startDate ?? null,
      currentDay: effectiveCurrentDay,
      durationDays,
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

// 개인 퀘스트 재반려 (리더 — 이미 승인/자동승인된 제안을 다시 반려).
// 반려 시 해당 참여자의 개인 퀘스트(questType='personal') 인증 게시물을 삭제하고
// 진행 기록의 개인 퀘스트 마커를 정리한다. (누적 점수 등 게이미피케이션 반영은 별도 도메인)
leaderRoutes.put('/quest-proposals/:proposalId/re-reject', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const proposalId = c.req.param('proposalId')!;
  const guard = await requireLeaderChallenge(c, challengeId);
  if (guard.error) return guard.error;

  const input = proposalReviewSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date();
  const nowIso = now.toISOString();

  const proposal = await findProposalById(challengeId, proposalId);
  if (!proposal) return fail(c, 404, 'PROPOSAL_NOT_FOUND', '제안서를 찾을 수 없습니다');
  if (!canRerejectProposal(proposal.status)) {
    return fail(c, 409, 'NOT_APPROVED', `이미 승인된 제안만 다시 반려할 수 있습니다 (status: ${proposal.status})`);
  }

  const applied = await updateProposalReReject({
    challengeId,
    sk: String(proposal.sk),
    reason: input.reason ?? null,
    reviewerId: c.get('authUser')!.userId,
    nowIso,
  });
  if (!applied) return fail(c, 409, 'NOT_APPROVED', '이미 처리된 제안서입니다');

  // 개인 퀘스트 인증 게시물 삭제 + 진행 기록 개인 퀘스트 마커 정리 (실패해도 반려 자체는 성공 처리)
  const participantId = String(proposal.userId);
  let deletedCount = 0;
  try {
    const verifications = await listUserChallengeVerifications(challengeId, participantId);
    const personal = verifications.filter((v) => v.questType === 'personal');
    for (const v of personal) {
      await deleteVerification({ pk: String(v.pk), sk: String(v.sk) });
      deletedCount += 1;
    }

    if (personal.length > 0) {
      const participation = await getParticipation(challengeId, participantId);
      if (participation) {
        const progress = normalizeProgress(participation.progress);
        let changed = false;
        const cleaned = progress.map((entry: any) => {
          if (!entry.personalVerificationId && entry.personalQuestDone !== true) return entry;
          changed = true;
          const next: any = { ...entry, personalQuestDone: false };
          delete next.personalVerificationId;
          // 개인 퀘스트로 완료됐던 날은 미완료(partial)로 강등 — 반려로 개인 인증이 사라졌으므로
          if (isCompletedProgressStatus(entry.status)) next.status = 'partial';
          return next;
        });
        if (changed) {
          await updateParticipationFields(challengeId, participantId, { progress: cleaned, updatedAt: nowIso });
        }
      }
    }
  } catch (err: any) {
    console.error('re-reject verification cleanup error (non-fatal):', err?.message);
  }

  return ok(
    c,
    { proposalId, status: 'rejected', deletedVerifications: deletedCount },
    '개인 퀘스트를 반려하고 관련 인증 게시물을 삭제했어요.',
  );
});
