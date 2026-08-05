/**
 * 내 챌린지 라우트 — GET /c/challenges/my
 * 레거시: backend/services/challenge/my-challenges/index.ts (userId-index Query + BatchGet → gsi1 UCUSER# Query + BatchGet)
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok } from '@chum7/api-kit';
import { calculateEffectiveCurrentDay, isCompletedProgressStatus, resolveDurationDays } from '../domain/day-sync';
import { normalizeProgress } from '../domain/progress';
import { matchesRequestedChallengeStatus, resolveNormalizedChallengeState } from '../domain/challenge-state';
import { getChallengesBatch } from '../repo/challenges';
import { listMyParticipations } from '../repo/participations';

export const myChallengeRoutes = new Hono<AppEnv>();

// 내 챌린지 목록 (레거시 GET /challenges/my — gsi1 UCUSER# Query)
myChallengeRoutes.get('/challenges/my', async (c) => {
  const { userId } = c.get('authUser')!;
  const status = c.req.query('status') || 'active';

  const userChallenges = await listMyParticipations(userId);
  if (userChallenges.length === 0) {
    return ok(c, { challenges: [], total: 0 });
  }

  const challengeIds = [...new Set(userChallenges.map((uc) => uc.challengeId as string))];
  const challenges = await getChallengesBatch(challengeIds);
  const challengeMap = new Map(challenges.map((ch) => [ch.challengeId, ch]));

  const nowIso = new Date().toISOString();
  const enrichedChallenges = userChallenges.map((uc) => {
    const challenge = challengeMap.get(uc.challengeId) as any;
    const durationDays = resolveDurationDays(challenge?.durationDays, uc.progress);

    const progressList = normalizeProgress(uc.progress);
    const completedDays = progressList.filter((p) => isCompletedProgressStatus(p?.status)).length;
    const progressPercentage = Math.max(0, Math.min(100, Math.round((completedDays / durationDays) * 100)));

    const effectiveCurrentDay = calculateEffectiveCurrentDay(
      { ...uc, challengeStartAt: challenge?.challengeStartAt },
      nowIso,
      durationDays,
    );

    // lifecycle-manager 크론 실행 지연 보정 (레거시 승계)
    const storedLifecycle = challenge?.lifecycle;
    const effectiveLifecycle = (
      storedLifecycle === 'preparing' &&
      !challenge?.requireStartConfirmation &&
      challenge?.challengeStartAt &&
      challenge.challengeStartAt <= nowIso
    ) ? 'active' : storedLifecycle;

    const { status: normalizedStatus, phase: normalizedPhase } = resolveNormalizedChallengeState({
      status: uc.status,
      phase: uc.phase,
      challengeLifecycle: effectiveLifecycle,
      effectiveCurrentDay,
      durationDays,
      completedDays,
    });

    return {
      userChallengeId: uc.userChallengeId,
      challengeId: uc.challengeId,
      phase: normalizedPhase,
      status: normalizedStatus,
      currentDay: effectiveCurrentDay,
      startDate: uc.startDate,
      durationDays,
      score: uc.score,
      thankScore: uc.thankScore ?? 0,
      cheerScore: uc.cheerScore ?? 0,
      cheerCount: uc.cheerCount,
      consecutiveDays: uc.consecutiveDays,
      personalGoal: uc.personalGoal ?? null,
      personalTarget: uc.personalTarget ?? null,
      remedyPolicy: uc.remedyPolicy ?? null,
      usedRemedyCount: progressList.filter((p) => p?.remedied === true).length,
      progress: progressList,
      progressPercentage,
      completedDays,
      challenge: challenge ? {
        challengeId: challenge.challengeId,
        title: challenge.title,
        description: challenge.description,
        category: challenge.category,
        targetTime: challenge.targetTime,
        badgeIcon: challenge.badgeIcon,
        badgeName: challenge.badgeName,
        // 종료 리캡용 — 정체성 헤드라인·비주얼·종료시각(자동팝업 최근성 게이트)
        identityKeyword: challenge.identityKeyword ?? null,
        coverImageUrl: challenge.coverImageUrl ?? null,
        challengeEndAt: challenge.challengeEndAt ?? challenge.endDate ?? null,
        challengeType: challenge.challengeType,
        personalQuestEnabled: challenge.personalQuestEnabled,
        personalQuestAutoApprove: challenge.personalQuestAutoApprove,
        remedyPolicy: challenge.defaultRemedyPolicy || null,
        lifecycle: effectiveLifecycle,
        // 리더 전체 해산 표식 — 완료 탭에서 '전체 해산' 라벨 분기용 (완주와 구분)
        disbanded: challenge.disbanded === true || Boolean(challenge.disbandedAt),
        requireStartConfirmation: challenge.requireStartConfirmation ?? false,
        challengeStartAt: challenge.challengeStartAt,
        actualStartAt: challenge.actualStartAt || null,
        startConfirmedAt: challenge.startConfirmedAt || null,
        recruitingEndAt: challenge.recruitingEndAt,
        allowedVerificationTypes: Array.isArray(challenge.allowedVerificationTypes) && challenge.allowedVerificationTypes.length > 0
          ? challenge.allowedVerificationTypes
          : ['image', 'text', 'link', 'video'],
        durationDays,
      } : null,
    };
  });

  const filteredChallenges = enrichedChallenges.filter((ch) => matchesRequestedChallengeStatus(status, ch.status));

  return ok(c, {
    challenges: filteredChallenges,
    total: filteredChallenges.length,
    summary: {
      active: filteredChallenges.filter((ch) => ch.status === 'active').length,
      completed: filteredChallenges.filter((ch) => ch.status === 'completed').length,
      failed: filteredChallenges.filter((ch) => ch.status === 'failed').length,
    },
  });
});
