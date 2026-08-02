/**
 * 보완(remedy) 인증 라우트 — POST /c/verifications/remedy
 * 레거시: backend/services/verification/remedy/index.ts
 * 정책: anytime(Day 2+, 이전 실패일만) / last_day(마지막 날 전용, maxRemedyDays 제한) / disabled.
 * 보완 성공 시 해당 progress 항목 status:'success', remedied:true 마킹.
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv, ApiContext } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { remedyVerificationSchema } from '../schemas';
import { calculateChallengeDay, certDateFromIso, remedyScore, safeTimezone } from '../domain/day-sync';
import { normalizeProgress } from '../domain/progress';
import { resolveAllowedTypes, resolvePerformedAt, resolveVerificationType } from '../domain/verification-rules';
import { getChallenge } from '../repo/challenges';
import { findMyParticipationByUcId, updateParticipationFields } from '../repo/participations';
import { putVerification, verificationKeys } from '../repo/verifications';

export const verificationRemedyRoutes = new Hono<AppEnv>();

function userTimezone(c: ApiContext, fallback?: string): string {
  return safeTimezone(c.req.header('x-user-timezone') || fallback);
}

// 보완 인증 (레거시 POST /verifications/remedy — 마지막 날/anytime 정책, remedied:true 마킹)
verificationRemedyRoutes.post('/remedy', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = remedyVerificationSchema.parse(await c.req.json().catch(() => ({})));

  const userChallenge = await findMyParticipationByUcId(userId, input.userChallengeId);
  if (!userChallenge) {
    return fail(c, 404, 'USER_CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  }

  const challenge = await getChallenge(userChallenge.challengeId);
  if (!challenge) {
    return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지 정보를 찾을 수 없습니다');
  }

  const durationDays = Number(challenge.durationDays ?? 7);
  const remedyPolicy = challenge.defaultRemedyPolicy ?? { type: 'anytime', maxRemedyDays: null };
  const remedyPolicyType: 'anytime' | 'last_day' | 'disabled' = remedyPolicy.type ?? 'anytime';
  const regularDays = remedyPolicyType === 'last_day' ? durationDays - 1 : durationDays;

  if (remedyPolicyType === 'disabled') {
    return fail(c, 400, 'REMEDY_NOT_ALLOWED', '이 챌린지는 보완이 허용되지 않습니다');
  }

  // effectiveCurrentDay = max(stored currentDay, 캘린더 계산 day)
  const nowIso = new Date().toISOString();
  const timezone = userTimezone(c, userChallenge.timezone);
  let effectiveCurrentDay = Number(userChallenge.currentDay || 1);
  if (userChallenge.startDate) {
    try {
      const certDate = certDateFromIso(nowIso, timezone);
      const calendarDay = calculateChallengeDay(userChallenge.startDate, certDate, timezone);
      if (Number.isFinite(calendarDay)) {
        effectiveCurrentDay = Math.max(effectiveCurrentDay, calendarDay);
      }
    } catch {
      // fallback to stored value
    }
  }

  if (remedyPolicyType === 'last_day') {
    // 마지막 날(durationDays)에만 보완 가능 (Day 1..durationDays-1 대상)
    if (effectiveCurrentDay !== durationDays) {
      return fail(c, 400, 'REMEDY_WRONG_DAY', `Day ${durationDays}에만 보완 인증이 가능합니다`);
    }
  } else if (effectiveCurrentDay < 2) {
    return fail(c, 400, 'REMEDY_WRONG_DAY', 'Day 2부터 보완 인증이 가능합니다');
  }

  if (input.originalDay > regularDays) {
    return fail(c, 400, 'REMEDY_TARGET_INVALID', `보완 가능한 최대 day는 ${regularDays}입니다`);
  }
  if (remedyPolicyType === 'anytime' && input.originalDay >= effectiveCurrentDay) {
    return fail(c, 400, 'REMEDY_TARGET_INVALID', '아직 완료되지 않은 day는 보완할 수 없습니다');
  }

  const progress = normalizeProgress(userChallenge.progress);
  const failedDays = progress.filter((p) => p.status !== 'success' && p.day <= regularDays);
  if (failedDays.length === 0) {
    return fail(c, 400, 'REMEDY_NO_FAILED_DAYS', '보완할 실패일이 없습니다');
  }

  const originalDayProgress = progress.find((p) => Number(p.day) === input.originalDay);
  if (!originalDayProgress || originalDayProgress.status === 'success') {
    return fail(c, 400, 'REMEDY_TARGET_INVALID', '보완 대상 day가 실제 실패일이 아닙니다');
  }
  if (originalDayProgress.remedied) {
    return fail(c, 409, 'REMEDY_TARGET_ALREADY_DONE', '이미 보완한 day입니다');
  }

  const alreadyRemediedCount = progress.filter((p) => p.remedied === true).length;
  if (remedyPolicyType === 'last_day' && remedyPolicy.maxRemedyDays !== null && remedyPolicy.maxRemedyDays !== undefined) {
    if (alreadyRemediedCount >= remedyPolicy.maxRemedyDays) {
      return fail(c, 409, 'REMEDY_MAX_REACHED', `최대 보완 횟수(${remedyPolicy.maxRemedyDays}회)에 도달했습니다`);
    }
  }

  const allowedTypes = resolveAllowedTypes(challenge.allowedVerificationTypes);
  // 다중 이미지 정규화 (최대 10)
  const imageUrls = input.imageUrls?.length ? input.imageUrls.slice(0, 10) : (input.imageUrl ? [input.imageUrl] : []);
  const primaryImage = imageUrls[0] ?? null;
  const verificationType = resolveVerificationType({ ...input, imageUrl: input.imageUrl || primaryImage || undefined });
  if (!allowedTypes.includes(verificationType)) {
    return fail(c, 400, 'UNSUPPORTED_VERIFICATION_TYPE',
      `해당 챌린지에서는 ${verificationType} 인증이 허용되지 않습니다. 허용: ${allowedTypes.join(', ')}`);
  }

  if (verificationType === 'image' && !primaryImage) {
    return fail(c, 400, 'MISSING_CONTENT', '이미지가 필요합니다');
  }
  if (verificationType === 'video' && !input.videoUrl && !primaryImage) {
    return fail(c, 400, 'MISSING_CONTENT', '영상 URL이 필요합니다');
  }
  if (verificationType === 'link' && !input.linkUrl) {
    return fail(c, 400, 'MISSING_CONTENT', '링크 URL이 필요합니다');
  }
  if (verificationType === 'link' && input.linkUrl && !input.linkUrl.startsWith('https://')) {
    return fail(c, 400, 'INSECURE_LINK', '링크는 https://로 시작해야 합니다');
  }

  const performedAt = resolvePerformedAt(input.practiceAt || input.completedAt || nowIso, nowIso);
  if (new Date(performedAt).getTime() > new Date(nowIso).getTime()) {
    return fail(c, 400, 'FUTURE_PRACTICE_TIME', 'practiceAt이 현재 시간보다 미래입니다');
  }
  const certDate = certDateFromIso(nowIso, timezone);

  const verificationId = randomUUID();
  const basePoints = Number(originalDayProgress.score || 1);
  const scoreEarned = Math.max(1, remedyScore(basePoints));

  await putVerification({
    ...verificationKeys({
      challengeId: userChallenge.challengeId,
      userId,
      day: effectiveCurrentDay,
      verificationId,
      createdAt: nowIso,
      isPublicFeed: false, // 보완 인증은 비공개 (레거시 isPublic:'false' 승계)
    }),
    verificationId,
    userId,
    userChallengeId: input.userChallengeId,
    challengeId: userChallenge.challengeId,
    day: effectiveCurrentDay,
    type: 'remedy',
    verificationType,
    imageUrl: primaryImage,
    imageUrls: imageUrls.length ? imageUrls : null,
    videoUrl: input.videoUrl || null,
    linkUrl: input.linkUrl || null,
    todayNote: input.todayNote || null,
    tomorrowPromise: input.tomorrowPromise || null,
    reflectionNote: input.reflectionNote || null,
    certDate,
    performedAt,
    practiceAt: performedAt,
    completedAt: performedAt,
    uploadAt: nowIso,
    uploadedAt: nowIso,
    targetTime: null,
    delta: null,
    score: scoreEarned,
    scoreEarned,
    cheerCount: 0,
    isPublic: 'false',
    isAnonymous: true,
    originalDay: input.originalDay,
    createdAt: nowIso,
  });

  // progress: originalDay를 성공(remedied:true)으로 마킹
  const updatedProgress: any[] = [...progress];
  const originalIndex = updatedProgress.findIndex((p) => Number(p.day) === input.originalDay);
  if (originalIndex >= 0) {
    updatedProgress[originalIndex] = {
      day: input.originalDay,
      status: 'success',
      verificationId,
      timestamp: nowIso,
      delta: 0,
      score: scoreEarned,
      remedied: true,
    };
  }

  const totalScore = updatedProgress
    .filter((p) => p.status === 'success')
    .reduce((sum, p) => sum + (p.score || 0), 0);

  await updateParticipationFields(userChallenge.challengeId, userId, {
    progress: updatedProgress,
    score: totalScore,
    updatedAt: nowIso,
  });

  let remainingRemedyDays: number;
  if (remedyPolicyType === 'last_day' && remedyPolicy.maxRemedyDays !== null && remedyPolicy.maxRemedyDays !== undefined) {
    remainingRemedyDays = Math.max(remedyPolicy.maxRemedyDays - (alreadyRemediedCount + 1), 0);
  } else {
    remainingRemedyDays = Math.max(failedDays.length - (alreadyRemediedCount + 1), 0);
  }

  return ok(c, {
    verificationId,
    originalDay: input.originalDay,
    verificationType,
    scoreEarned,
    totalScore,
    remainingRemedyDays,
    newBadges: [],
  }, `Day ${input.originalDay} 보완 완료!`);
});
