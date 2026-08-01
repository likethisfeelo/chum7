/**
 * 인증 제출 라우트 — POST /c/verifications (핵심 핸들러)
 * 레거시: backend/services/verification/submit/index.ts
 * 판정 로직은 src/domain/{day-sync,verification-rules,progress}.ts 순수 함수 사용.
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv, ApiContext } from '@chum7/api-kit';
import { ok, fail, publishEvent } from '@chum7/api-kit';
import { submitVerificationSchema } from '../schemas';
import { calculateChallengeDay, safeTimezone, validatePracticeAt } from '../domain/day-sync';
import { normalizeProgress } from '../domain/progress';
import {
  buildTargetDateTimeISO,
  calculateDelta,
  createDayCompletionRules,
  evaluateSubmission,
  isValidTrimRange,
  resolveAllowedTypes,
  resolvePerformedAt,
  resolveQuestType,
  resolveVerificationType,
} from '../domain/verification-rules';
import { getChallenge } from '../repo/challenges';
import { effectiveLifecycleOf } from '../domain/challenge-state';
import { addParticipationScores, findMyParticipationByUcId, listChallengeParticipations, updateParticipationFields } from '../repo/participations';
import { computeScoreDeltas } from '../domain/score-rules';
import { putVerification, verificationKeys } from '../repo/verifications';
import { listQuests } from '../repo/quests';

export const verificationRoutes = new Hono<AppEnv>();

function userTimezone(c: ApiContext, fallback?: string): string {
  return safeTimezone(c.req.header('x-user-timezone') || fallback);
}

// 인증 제출 (레거시 POST /verifications)
verificationRoutes.post('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = submitVerificationSchema.parse(await c.req.json().catch(() => ({})));
  const verificationType = resolveVerificationType(input);

  // ── 콘텐츠 검증 (레거시 승계) ──────────────────────────────────────────
  if (verificationType === 'image' && !input.imageUrl) {
    return fail(c, 400, 'MISSING_IMAGE_URL', '사진 인증에는 imageUrl이 필요합니다');
  }
  if (verificationType === 'video') {
    if (!input.videoUrl && !input.imageUrl) {
      return fail(c, 400, 'MISSING_VIDEO_URL', '영상 인증에는 videoUrl이 필요합니다');
    }
    if (input.videoDurationSec !== undefined && input.videoDurationSec > 60) {
      return fail(c, 400, 'VIDEO_DURATION_EXCEEDED', '영상은 60초 이내만 허용됩니다');
    }
    if (!isValidTrimRange(input.trimStartSec, input.trimEndSec)) {
      return fail(c, 400, 'INVALID_TRIM_RANGE', '트림 구간은 60초 이내로 설정해주세요');
    }
  }
  if (verificationType === 'link' && !input.linkUrl) {
    return fail(c, 400, 'MISSING_LINK_URL', '링크 인증에는 linkUrl이 필요합니다');
  }
  if (verificationType === 'link' && input.linkUrl && !input.linkUrl.startsWith('https://')) {
    return fail(c, 400, 'INVALID_LINK_URL', '링크는 https URL만 허용됩니다');
  }
  const hasTodayNote = Boolean(input.todayNote?.trim());
  if (!hasTodayNote && !input.imageUrl && !input.videoUrl && !input.linkUrl) {
    return fail(c, 400, 'EMPTY_VERIFICATION_CONTENT', '텍스트, 이미지, 영상, 링크 중 하나 이상은 필요합니다');
  }

  // ── 참여/챌린지 로드 ──────────────────────────────────────────────────
  const userChallenge = await findMyParticipationByUcId(userId, input.userChallengeId);
  if (!userChallenge) {
    return fail(c, 404, 'USER_CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  }
  // 개인 퀘스트 재반려 후 재제출 미이행으로 참여가 제한된 경우 인증 불가
  if (userChallenge.status === 'blocked' || userChallenge.phase === 'blocked') {
    return fail(c, 403, 'PARTICIPATION_BLOCKED', '개인 퀘스트가 승인되지 않아 이 챌린지 참여가 제한되었습니다.');
  }
  const challengeId: string | null = typeof userChallenge.challengeId === 'string' && userChallenge.challengeId.trim()
    ? userChallenge.challengeId.trim()
    : null;
  if (!challengeId) {
    return fail(c, 400, 'MISSING_CHALLENGE_ID', '챌린지 정보가 유효하지 않습니다. 다시 참여 후 시도해주세요');
  }

  const challenge = (await getChallenge(challengeId)) ?? {};

  // 시작 전(draft/recruiting/preparing) 챌린지에는 인증을 남길 수 없다 — 시작 후에만 허용.
  // (표시 지연 흡수용 effectiveLifecycle 기준. 챌린지 미로딩 시 가드 생략)
  if (challenge.lifecycle) {
    const eff = effectiveLifecycleOf(challenge, new Date());
    if (eff === 'draft' || eff === 'recruiting' || eff === 'preparing') {
      return fail(c, 409, 'CHALLENGE_NOT_STARTED', '챌린지가 시작된 후에 인증을 남길 수 있어요.');
    }
  }

  const allowedTypes = resolveAllowedTypes(challenge.allowedVerificationTypes);
  const challengeTargetTime24: string | null =
    typeof challenge.targetTime === 'string' && /^\d{2}:\d{2}$/.test(challenge.targetTime.trim())
      ? challenge.targetTime.trim()
      : null;
  const challengeTitle: string | null = typeof challenge.title === 'string' ? challenge.title : null;
  const challengeCategory: string | null = typeof challenge.category === 'string' ? challenge.category : null;
  const challengeType: string = typeof challenge.challengeType === 'string' ? challenge.challengeType : 'leader_personal';
  const rawDuration = Number(challenge.durationDays);
  const challengeDurationDays = Number.isFinite(rawDuration) && rawDuration > 0 ? Math.floor(rawDuration) : 7;

  // 리더 퀘스트 전체 목록 (N개 모두 완료 요건 판단용)
  let totalLeaderQuestIds: string[] = [];
  let leaderQuestsFetched = false;
  try {
    const quests = await listQuests(challengeId);
    totalLeaderQuestIds = quests
      .filter((q) => q.status === 'active' && q.questScope !== 'personal')
      .map((q) => q.questId as string);
    leaderQuestsFetched = true;
  } catch (err: any) {
    console.warn('Failed to fetch leader quests (non-fatal):', err?.message);
  }

  if (!allowedTypes.includes(verificationType)) {
    return fail(c, 400, 'UNSUPPORTED_VERIFICATION_TYPE', `해당 챌린지에서는 ${verificationType} 인증이 허용되지 않습니다`);
  }

  // ── performedAt(user, today-only, not-future) / uploadAt(server) 정책 ──
  const nowIso = new Date().toISOString();
  const performedAt = resolvePerformedAt(input.performedAt || input.completedAt || nowIso, nowIso);
  const timezone = userTimezone(c, userChallenge.timezone);

  const practiceValidation = validatePracticeAt(performedAt, nowIso, timezone);
  if (!practiceValidation.ok) {
    return fail(c, 400, practiceValidation.errorCode,
      practiceValidation.errorCode === 'FUTURE_PRACTICE_TIME'
        ? 'practiceAt이 uploadAt보다 미래입니다'
        : 'practiceAt이 허용 범위를 초과했습니다');
  }

  // day 윈도우 검증 — 서버 계산 day ±1 허용 (타임존 경계 보정, 레거시 승계)
  if (userChallenge.startDate) {
    const calculatedDay = calculateChallengeDay(userChallenge.startDate, practiceValidation.certDate, timezone);
    if (Math.abs(input.day - calculatedDay) > 1) {
      return fail(c, 400, 'INVALID_DAY', '요청 day가 서버 계산 day와 불일치합니다');
    }
  }

  // ── challengeType 기반 완료/isExtra 판정 (혼합형 questType 플로우) ─────
  const progress = normalizeProgress(userChallenge.progress);
  const dayProgress = progress.find((p) => Number(p?.day) === input.day);

  const dayCtx = { challengeType, totalLeaderQuestIds, leaderQuestsFetched };
  const rules = createDayCompletionRules(dayCtx);
  const resolvedQuestType = resolveQuestType(challengeType, input.questType ?? null);

  if (resolvedQuestType === 'leader' && leaderQuestsFetched && rules.totalLeaderQuestCount === 0) {
    return fail(c, 400, 'NO_LEADER_QUESTS_REGISTERED', '등록된 리더 퀘스트가 없습니다. 리더가 퀘스트를 먼저 등록해야 합니다');
  }

  const outcome = evaluateSubmission(rules, dayCtx, dayProgress, resolvedQuestType, input.questId);
  const { isExtra, dayNowComplete, leaderQuestIds, leaderQuestDone, personalQuestDone } = outcome;

  const verificationDate = input.verificationDate || practiceValidation.certDate;

  const personalTarget = userChallenge.personalTarget;
  const effectiveTime24 = personalTarget?.time24 || challengeTargetTime24;
  const effectiveTimezone = personalTarget?.timezone || timezone;
  const derivedTargetTime = effectiveTime24
    ? buildTargetDateTimeISO(verificationDate, effectiveTime24, effectiveTimezone)
    : undefined;

  if (personalTarget?.time24 && !derivedTargetTime && !input.targetTime) {
    return fail(c, 400, 'INVALID_PERSONAL_TARGET_TIME', '개인 목표시간 형식이 올바르지 않습니다. 다시 설정해주세요');
  }

  const effectiveTargetTime = input.targetTime || derivedTargetTime;
  const delta = isExtra || !effectiveTargetTime ? null : calculateDelta(effectiveTargetTime, performedAt);
  if (effectiveTargetTime && !isExtra && delta === null) {
    return fail(c, 400, 'INVALID_TARGET_TIME_FORMAT', '인증 시각 또는 목표 시각 형식이 올바르지 않습니다');
  }

  const isEarlyCompletion = !isExtra && dayNowComplete && (delta || 0) > 0;

  // ── 인증 아이템 기록 (isPublic → gsi2 VFPUB#<KST date> 필수) ──────────
  const verificationId = randomUUID();
  const isPersonalOnly = isExtra ? true : false;
  const verification = {
    ...verificationKeys({
      challengeId,
      userId,
      day: input.day,
      verificationId,
      createdAt: nowIso,
      isPublicFeed: input.isPublic && !isPersonalOnly,
    }),
    verificationId,
    userId,
    userChallengeId: input.userChallengeId,
    challengeId,
    challengeTitle,
    challengeCategory,
    day: input.day,
    type: 'normal',
    verificationType,
    imageUrl: input.imageUrl || null,
    videoUrl: input.videoUrl || (verificationType === 'video' ? input.imageUrl || null : null),
    videoDurationSec: input.videoDurationSec ?? null,
    trimStartSec: input.trimStartSec ?? null,
    trimEndSec: input.trimEndSec ?? null,
    videoObjectKey: input.videoObjectKey ?? null,
    mediaValidationStatus: verificationType === 'video' ? input.mediaValidationStatus || 'pending' : null,
    linkUrl: input.linkUrl || null,
    todayNote: input.todayNote?.trim() || null,
    tomorrowPromise: input.tomorrowPromise || null,
    verificationDate,
    certDate: verificationDate,
    practiceAt: performedAt,
    performedAt,
    uploadAt: nowIso,
    uploadedAt: nowIso,
    completedAt: performedAt,
    targetTime: effectiveTargetTime || null,
    delta,
    score: isExtra || !dayNowComplete ? 0 : 1,
    scoreEarned: isExtra || !dayNowComplete ? 0 : 1,
    cheerCount: 0,
    isPublic: input.isPublic ? 'true' : 'false',
    isAnonymous: input.isAnonymous,
    originalDay: null,
    reflectionNote: null,
    questType: resolvedQuestType,
    questId: input.questId ?? null,
    isExtra,
    primaryVerificationId: isExtra ? dayProgress?.verificationId || null : null,
    isPersonalOnly,
    ...(input.hashtag ? { hashtag: input.hashtag.replace(/^#+/, '').trim() } : {}),
    createdAt: nowIso,
  };

  await putVerification(verification);

  // 해쉬태그 레지스트리·응원(cheer)·뱃지는 social/cheer/gamification 도메인 소유 — PORTING.md gap 기록

  if (isExtra) {
    return ok(c, {
      verificationId,
      isExtra: true,
      scoreEarned: 0,
      delta: null,
      cheerOpportunity: null,
      notice: '점수와 응원 혜택은 오늘의 첫 번째 완료 인증에만 적용됩니다.',
    }, '오늘의 추가 기록이 저장되었어요 📝');
  }

  // ── progress 배열 업데이트 (partial → success 흐름) ────────────────────
  const updatedProgress: any[] = [...progress];
  const existingIndex = updatedProgress.findIndex((p) => Number(p?.day) === input.day);
  const existingDayEntry = existingIndex >= 0 ? updatedProgress[existingIndex] : null;

  if (!dayNowComplete) {
    const partialEntry = {
      ...(existingDayEntry ?? {}),
      day: input.day,
      status: 'partial',
      verificationId: existingDayEntry?.verificationId ?? verificationId,
      timestamp: existingDayEntry?.timestamp ?? performedAt,
      delta: 0,
      score: 0,
      leaderQuestIds,
      leaderQuestDone: leaderQuestDone === true,
      personalQuestDone: personalQuestDone === true,
      ...(resolvedQuestType === 'leader' ? { leaderVerificationId: verificationId } : {}),
      ...(resolvedQuestType === 'personal' ? { personalVerificationId: verificationId } : {}),
    };
    if (existingIndex >= 0) updatedProgress[existingIndex] = partialEntry;
    else updatedProgress.push(partialEntry);

    try {
      await updateParticipationFields(challengeId, userId, { progress: updatedProgress, updatedAt: nowIso });
    } catch (partialWriteErr: any) {
      console.error('Partial progress write error (non-fatal):', partialWriteErr?.message);
    }
    await publishEvent('verification.submitted', {
      verificationId,
      userId,
      challengeId,
      day: input.day,
      isDayComplete: false,
      isPublic: input.isPublic === true,
    });
    const partialMsg = rules.isMixedType
      ? (resolvedQuestType === 'leader'
          ? '리더 퀘스트 인증 완료! 개인 퀘스트도 인증해야 오늘 인증이 완료됩니다 🎯'
          : '개인 퀘스트 인증 완료! 리더 퀘스트도 인증해야 오늘 인증이 완료됩니다 🎯')
      : `리더 퀘스트 ${leaderQuestIds.length}/${rules.totalLeaderQuestCount} 완료! 나머지 리더 퀘스트도 인증해야 오늘이 완료됩니다 🎯`;
    return ok(c, {
      verificationId,
      isExtra: false,
      isDayComplete: false,
      questType: resolvedQuestType,
      scoreEarned: 0,
      delta: null,
      cheerOpportunity: null,
    }, partialMsg);
  }

  const newProgress = {
    day: input.day,
    status: 'success',
    verificationId,
    timestamp: performedAt,
    delta: delta || 0,
    score: 1,
    leaderQuestIds,
    leaderQuestDone: leaderQuestDone ?? false,
    personalQuestDone: personalQuestDone ?? false,
    ...(rules.isMixedType && resolvedQuestType === 'leader' ? { leaderVerificationId: verificationId } : {}),
    ...(rules.isMixedType && resolvedQuestType === 'personal' ? { personalVerificationId: verificationId } : {}),
  };
  if (existingIndex >= 0) updatedProgress[existingIndex] = newProgress;
  else updatedProgress.push(newProgress);

  let consecutiveDays = 0;
  for (let i = 1; i <= input.day; i += 1) {
    const p = updatedProgress.find((pr) => Number(pr?.day) === i);
    if (p && p.status === 'success') consecutiveDays += 1;
    else break;
  }

  const totalScore = updatedProgress
    .filter((p) => p.status === 'success')
    .reduce((sum, p) => sum + (p.score || 0), 0);

  const maxDay = challengeDurationDays + 1;
  const nextDay = Math.min(maxDay, input.day + 1);

  await updateParticipationFields(challengeId, userId, {
    progress: updatedProgress,
    currentDay: nextDay,
    score: totalScore,
    consecutiveDays,
    updatedAt: nowIso,
  });

  // ── 응원/감사 점수 적립 + cheerOpportunity (레거시 cheer-thank 이식, docs/cheer-thank-system.md) ──
  // 응원 레코드 없이 "완료 순서"만으로 cheerScore/thankScore를 결정적으로 재현한다.
  // day가 이번 제출로 "처음" 완료됐을 때만 1회 적립 (재산정 방지 — 멱등성).
  const wasAlreadyComplete = existingDayEntry
    ? ['success', 'completed', 'remedy'].includes(String(existingDayEntry.status))
    : false;
  let cheerOpportunity: Record<string, unknown> = { hasIncompletePeople: false, incompleteCount: 0 };
  try {
    const members = await listChallengeParticipations(challengeId);
    const activeMembers = members.filter((m) => m.status === 'active');
    const isEarlyEntry = (e: any) =>
      Boolean(e && ['success', 'completed', 'remedy'].includes(String(e.status)) && Number(e.delta) > 0);

    const activeUserIds = activeMembers.map((m) => String(m.userId));
    if (!activeUserIds.includes(userId)) activeUserIds.push(userId);

    const completedUserIds = new Set<string>([userId]); // 방금 완료
    const earlyCompletedUserIds = new Set<string>();
    if (isEarlyCompletion) earlyCompletedUserIds.add(userId);
    for (const m of activeMembers) {
      if (String(m.userId) === userId) continue;
      const entry = normalizeProgress(m.progress).find((p) => Number(p.day) === input.day);
      if (rules.isDayComplete(entry)) completedUserIds.add(String(m.userId));
      if (isEarlyEntry(entry)) earlyCompletedUserIds.add(String(m.userId));
    }

    const incompleteCount = activeUserIds.filter((u) => u !== userId && !completedUserIds.has(u)).length;
    cheerOpportunity = incompleteCount > 0
      ? { hasIncompletePeople: true, incompleteCount, cheerTicketGranted: isEarlyCompletion }
      : { hasIncompletePeople: false, incompleteCount: 0 };

    if (!wasAlreadyComplete) {
      const deltas = computeScoreDeltas({
        completerId: userId,
        creatorId: typeof challenge.createdBy === 'string' ? challenge.createdBy : null,
        activeUserIds,
        completedUserIds,
        earlyCompletedUserIds,
      });
      await Promise.all(
        deltas.map((d) =>
          addParticipationScores(challengeId, d.userId, { cheerScore: d.cheerScore, thankScore: d.thankScore }, nowIso),
        ),
      );
    }
  } catch (err) {
    console.error('cheer/thank scoring aggregation error (non-fatal):', err);
  }

  await publishEvent('verification.submitted', {
    verificationId,
    userId,
    challengeId,
    day: input.day,
    isDayComplete: true,
    isPublic: input.isPublic === true,
  });

  const message = isEarlyCompletion
    ? `Day ${input.day} 완료! 목표보다 ${delta}분 일찍!`
    : `Day ${input.day} 완료!`;

  return ok(c, {
    verificationId,
    isExtra: false,
    isDayComplete: true,
    questType: resolvedQuestType,
    verificationDate,
    performedAt,
    uploadedAt: nowIso,
    day: input.day,
    delta,
    isEarlyCompletion,
    scoreEarned: 1,
    totalScore,
    consecutiveDays,
    cheerOpportunity,
    newBadges: [], // 뱃지 부여는 gamification 도메인 — 이벤트 계약 필요 (PORTING.md gap)
    eligibleCheerIds: [], // 응원 생성은 cheer-api 소유 (PORTING.md gap)
  }, message);
});
