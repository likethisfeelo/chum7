// backend/services/verification/submit/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  calculateChallengeDay,
  isInvalidDayDelta,
  safeTimezone,
  validatePracticeAt,
} from "../../../shared/lib/challenge-quest-policy";
import { resolveVerificationType } from "../../../shared/lib/verification-type";
import { isValidTrimRange } from "../../../shared/lib/trim-validation";
import { normalizeProgress } from "../../../shared/lib/progress";
import { grantBadges } from "../../../shared/lib/badge-grant";
import { docClient } from "../../../shared/lib/dynamodb-client";
import { response } from "../../../shared/lib/api-response";

const snsClient = new SNSClient({});

const submitSchema = z.object({
  userChallengeId: z.string().uuid(),
  day: z.number().min(1).max(30),
  verificationType: z.enum(["text", "image", "video", "link"]).optional(),
  questType: z.enum(["leader", "personal"]).optional(),
  questId: z.string().optional(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  videoDurationSec: z.number().min(0).max(60).optional(),
  trimStartSec: z.number().min(0).max(60).optional(),
  trimEndSec: z.number().min(0).max(60).optional(),
  videoObjectKey: z.string().min(1).optional(),
  mediaValidationStatus: z.enum(["pending", "valid", "invalid"]).optional(),
  linkUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith("https://"), "HTTPS_ONLY")
    .optional(),
  todayNote: z.string().max(500).optional(),
  tomorrowPromise: z.string().max(500).optional(),
  hashtag: z
    .string()
    .max(30)
    .regex(/^[가-힣a-zA-Z0-9_-]*$/, "HASHTAG_INVALID_CHARS")
    .optional(),
  verificationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  performedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  targetTime: z.string().datetime().optional(),
  isPublic: z.boolean().default(true),
  isAnonymous: z.boolean().default(true),
});

type SubmitInput = z.infer<typeof submitSchema>;


function parseIsoToMs(value: string): number | null {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function calculateDelta(
  targetTime: string,
  completedAt: string,
): number | null {
  const target = parseIsoToMs(targetTime);
  const completed = parseIsoToMs(completedAt);
  if (target === null || completed === null) return null;

  const diffMs = target - completed;
  return Math.floor(diffMs / 60000);
}

function buildTargetDateTimeISO(
  verificationDate: string,
  time24: string,
  timezone: string,
): string | null {
  const [hh, mm] = time24.split(":").map(Number);
  const [y, m, d] = verificationDate.split("-").map(Number);

  const hasInvalidParts = [hh, mm, y, m, d].some((v) => Number.isNaN(v));
  if (hasInvalidParts) return null;

  if (timezone === "Asia/Seoul") {
    const utcMs = Date.UTC(y, m - 1, d, hh - 9, mm, 0, 0);
    const iso = new Date(utcMs).toISOString();
    return Number.isNaN(new Date(iso).getTime()) ? null : iso;
  }

  const iso = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0)).toISOString();
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function resolveChallengeId(userChallenge: Record<string, any>): string | null {
  const raw =
    userChallenge?.challengeId ?? userChallenge?.challenge?.challengeId ?? null;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  return normalized || null;
}


async function checkIncompleteUsers(
  groupId: string,
  currentDay: number,
): Promise<{ hasIncompletePeople: boolean; incompleteCount: number }> {
  if (!groupId) {
    return { hasIncompletePeople: false, incompleteCount: 0 };
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: "groupId-index",
      KeyConditionExpression: "groupId = :groupId",
      ExpressionAttributeValues: {
        ":groupId": groupId,
      },
    }),
  );

  if (!result.Items) {
    return { hasIncompletePeople: false, incompleteCount: 0 };
  }

  const incompleteUsers = result.Items.filter((uc: any) => {
    const progress = normalizeProgress(uc.progress);
    const todayProgress = progress.find(
      (p: any) => Number(p?.day) === currentDay,
    );
    return !todayProgress || todayProgress.status !== "success";
  });

  return {
    hasIncompletePeople: incompleteUsers.length > 0,
    incompleteCount: incompleteUsers.length,
  };
}

const ANIMAL_ALIASES = ["새벽고래", "숲토끼", "별다람쥐", "파도해달", "노을팬더", "하늘사슴"];
function randomAlias(): string {
  return ANIMAL_ALIASES[Math.floor(Math.random() * ANIMAL_ALIASES.length)];
}

async function createAutoCheer(params: {
  senderId: string;
  receiverId: string;
  challengeId: string;
  verificationId: string;
  delta: number;
  senderAlias: string;
  memberTarget24: string | null;
  verificationDate: string;
  memberTimezone: string;
  nowISO: string;
  day: number;
}): Promise<string | null> {
  if (!process.env.CHEERS_TABLE) return null;
  const {
    senderId, receiverId, challengeId, verificationId, delta, senderAlias,
    memberTarget24, verificationDate, memberTimezone, nowISO, day,
  } = params;

  if (!memberTarget24) return null;

  const memberTargetISO = buildTargetDateTimeISO(verificationDate, memberTarget24, memberTimezone);
  if (!memberTargetISO) return null;

  const memberTargetMs = new Date(memberTargetISO).getTime();
  const nowMs = new Date(nowISO).getTime();
  const scheduledMs = memberTargetMs - delta * 60000;
  const isImmediate = scheduledMs <= nowMs;

  const cheerId = uuidv4();
  const cheer: Record<string, any> = {
    cheerId,
    senderId,
    receiverId,
    verificationId,
    challengeId,
    cheerType: isImmediate ? "immediate" : "scheduled",
    day,
    message: null,
    senderDelta: delta,
    senderAlias,
    scheduledTime: isImmediate ? null : new Date(scheduledMs).toISOString(),
    status: isImmediate ? "sent" : "pending",
    isRead: false,
    isThanked: false,
    thankedAt: null,
    replyMessage: null,
    repliedAt: null,
    reactionType: null,
    reactedAt: null,
    createdAt: nowISO,
    sentAt: isImmediate ? nowISO : null,
  };

  await docClient.send(new PutCommand({
    TableName: process.env.CHEERS_TABLE!,
    Item: cheer,
  }));

  if (isImmediate && process.env.SNS_TOPIC_ARN) {
    try {
      await snsClient.send(new PublishCommand({
        TopicArn: process.env.SNS_TOPIC_ARN!,
        Message: JSON.stringify({
          userId: receiverId,
          notification: {
            title: "응원이 도착했어요",
            body: "당신을 응원합니다",
            data: { type: "cheer_received", cheerId, timestamp: nowISO },
          },
        }),
      }));
    } catch (snsErr) {
      console.error("Auto cheer SNS error (non-fatal):", snsErr);
    }
  }

  return cheerId;
}


export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || "{}");
    const input: SubmitInput = submitSchema.parse(body);
    const verificationType = resolveVerificationType(input);

    if (verificationType === "image" && !input.imageUrl) {
      return response(400, {
        error: "MISSING_IMAGE_URL",
        message: "사진 인증에는 imageUrl이 필요합니다",
      });
    }

    if (verificationType === "video") {
      if (!input.videoUrl && !input.imageUrl) {
        return response(400, {
          error: "MISSING_VIDEO_URL",
          message: "영상 인증에는 videoUrl이 필요합니다",
        });
      }
      if (input.videoDurationSec !== undefined && input.videoDurationSec > 60) {
        return response(400, {
          error: "VIDEO_DURATION_EXCEEDED",
          message: "영상은 60초 이내만 허용됩니다",
        });
      }
      if (!isValidTrimRange(input.trimStartSec, input.trimEndSec)) {
        return response(400, {
          error: "INVALID_TRIM_RANGE",
          message: "트림 구간은 60초 이내로 설정해주세요",
        });
      }
    }

    if (verificationType === "link" && !input.linkUrl) {
      return response(400, {
        error: "MISSING_LINK_URL",
        message: "링크 인증에는 linkUrl이 필요합니다",
      });
    }

    if (
      verificationType === "link" &&
      input.linkUrl &&
      !input.linkUrl.startsWith("https://")
    ) {
      return response(400, {
        error: "INVALID_LINK_URL",
        message: "링크는 https URL만 허용됩니다",
      });
    }

    const hasTodayNote = Boolean(input.todayNote?.trim());
    if (!hasTodayNote && !input.imageUrl && !input.videoUrl && !input.linkUrl) {
      return response(400, {
        error: "EMPTY_VERIFICATION_CONTENT",
        message: "텍스트, 이미지, 영상, 링크 중 하나 이상은 필요합니다",
      });
    }

    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return response(401, {
        error: "UNAUTHORIZED",
        message: "인증이 필요합니다",
      });
    }

    if (!process.env.USER_CHALLENGES_TABLE || !process.env.VERIFICATIONS_TABLE) {
      console.error("Missing required env vars", {
        USER_CHALLENGES_TABLE: process.env.USER_CHALLENGES_TABLE,
        VERIFICATIONS_TABLE: process.env.VERIFICATIONS_TABLE,
      });
      return response(500, {
        error: "CONFIGURATION_ERROR",
        message: "서버 설정 오류가 발생했습니다",
      });
    }

    const userChallengeResult = await docClient.send(
      new GetCommand({
        TableName: process.env.USER_CHALLENGES_TABLE!,
        Key: { userChallengeId: input.userChallengeId },
      }),
    );

    if (!userChallengeResult.Item) {
      return response(404, {
        error: "USER_CHALLENGE_NOT_FOUND",
        message: "챌린지를 찾을 수 없습니다",
      });
    }

    const userChallenge = userChallengeResult.Item;
    if (userChallenge.userId && userChallenge.userId !== userId) {
      return response(403, {
        error: "FORBIDDEN",
        message: "본인 챌린지만 인증할 수 있습니다",
      });
    }

    const challengeId = resolveChallengeId(userChallenge);
    if (!challengeId) {
      return response(400, {
        error: "MISSING_CHALLENGE_ID",
        message: "챌린지 정보가 유효하지 않습니다. 다시 참여 후 시도해주세요",
      });
    }

    const allowedTypes = ["image", "text", "link", "video"] as Array<
      "image" | "text" | "link" | "video"
    >;
    let challengeTargetTime24: string | null = null;
    let challengeTitle: string | null = null;
    let challengeCategory: string | null = null;
    let challengeType: string = "leader_personal";
    let challengeDurationDays: number = 7;
    let challengeCreatorId: string | null = null;
    if (process.env.CHALLENGES_TABLE) {
      try {
        const challengeResult = await docClient.send(
          new GetCommand({
            TableName: process.env.CHALLENGES_TABLE,
            Key: { challengeId },
          }),
        );
        const rawAllowedTypes = challengeResult.Item?.allowedVerificationTypes;
        if (Array.isArray(rawAllowedTypes) && rawAllowedTypes.length > 0) {
          const sanitized = rawAllowedTypes.filter((type) =>
            ["image", "text", "link", "video"].includes(type),
          ) as Array<"image" | "text" | "link" | "video">;
          if (sanitized.length > 0) {
            allowedTypes.splice(0, allowedTypes.length, ...sanitized);
          }
        }
        const rawTargetTime = challengeResult.Item?.targetTime;
        if (
          typeof rawTargetTime === "string" &&
          /^\d{2}:\d{2}$/.test(rawTargetTime.trim())
        ) {
          challengeTargetTime24 = rawTargetTime.trim();
        }
        challengeTitle =
          typeof challengeResult.Item?.title === "string"
            ? challengeResult.Item.title
            : null;
        challengeCategory =
          typeof challengeResult.Item?.category === "string"
            ? challengeResult.Item.category
            : null;
        if (typeof challengeResult.Item?.challengeType === "string") {
          challengeType = challengeResult.Item.challengeType;
        }
        const rawDuration = Number(challengeResult.Item?.durationDays);
        if (Number.isFinite(rawDuration) && rawDuration > 0) {
          challengeDurationDays = Math.floor(rawDuration);
        }
        challengeCreatorId =
          typeof challengeResult.Item?.creatorId === "string"
            ? challengeResult.Item.creatorId
            : typeof challengeResult.Item?.createdBy === "string"
              ? challengeResult.Item.createdBy
              : null;
      } catch (challengeErr: any) {
        console.warn("Failed to fetch challenge data (non-fatal):", {
          challengeId,
          name: challengeErr?.name,
          message: challengeErr?.message,
        });
      }
    }

    // 리더 퀘스트 전체 목록 조회 (N개 모두 완료 요건 판단용)
    let totalLeaderQuestCount = 0;
    let totalLeaderQuestIds: string[] = [];
    // leaderQuestsFetched=true → QUESTS_TABLE 조회 성공 (0개 포함)
    // leaderQuestsFetched=false → 테이블 미설정 또는 조회 실패 → 레거시 boolean 폴백
    let leaderQuestsFetched = false;
    if (process.env.QUESTS_TABLE) {
      try {
        const leaderQuestResult = await docClient.send(new QueryCommand({
          TableName: process.env.QUESTS_TABLE,
          IndexName: 'challengeId-index',
          KeyConditionExpression: 'challengeId = :cid',
          FilterExpression: '#status = :active AND questScope <> :personal',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':cid': challengeId, ':active': 'active', ':personal': 'personal' },
        }));
        totalLeaderQuestIds = (leaderQuestResult.Items ?? []).map((q: any) => q.questId as string);
        totalLeaderQuestCount = totalLeaderQuestIds.length;
        leaderQuestsFetched = true;
      } catch (leaderQuestErr: any) {
        console.warn('Failed to fetch leader quests (non-fatal):', leaderQuestErr?.message);
      }
    }

    if (!allowedTypes.includes(verificationType)) {
      return response(400, {
        error: "UNSUPPORTED_VERIFICATION_TYPE",
        message: `해당 챌린지에서는 ${verificationType} 인증이 허용되지 않습니다`,
      });
    }

    const nowIso = new Date().toISOString();
    const CLOCK_SKEW_TOLERANCE_MS = 60_000; // 60초 허용 (NTP 드리프트 등 클라이언트 시계 편차)
    const performedAtRaw = input.performedAt || input.completedAt || nowIso;
    const performedAtMs = new Date(performedAtRaw).getTime();
    const nowMs = new Date(nowIso).getTime();
    // 클라이언트 시계가 서버보다 최대 60초 앞선 경우 서버 시각으로 대체 (오탐 방지)
    const performedAt =
      performedAtMs > nowMs && performedAtMs - nowMs <= CLOCK_SKEW_TOLERANCE_MS
        ? nowIso
        : performedAtRaw;
    const timezone = safeTimezone(
      ((event.headers?.["x-user-timezone"] ||
        event.headers?.["X-User-Timezone"]) as string | undefined) ||
        userChallenge.timezone,
    );

    const practiceValidation = validatePracticeAt(
      performedAt,
      nowIso,
      timezone,
    );
    if (!practiceValidation.ok) {
      return response(400, {
        error: practiceValidation.errorCode,
        message:
          practiceValidation.errorCode === "FUTURE_PRACTICE_TIME"
            ? "practiceAt이 uploadAt보다 미래입니다"
            : "practiceAt이 허용 범위를 초과했습니다",
      });
    }

    if (userChallenge.startDate) {
      const calculatedDay = calculateChallengeDay(
        userChallenge.startDate,
        practiceValidation.certDate,
        timezone,
      );
      // 타임존 경계에서 ±1 오차 허용
      if (Math.abs(input.day - calculatedDay) > 1) {
        return response(400, {
          error: "INVALID_DAY",
          message: "요청 day가 서버 계산 day와 불일치합니다",
        });
      }
    }

    const progress = normalizeProgress(userChallenge.progress);
    const dayProgress = progress.find((p: any) => Number(p?.day) === input.day);

    // 퀘스트 타입 결정: 요청값 우선, 없으면 challengeType에서 기본값 추론
    const isMixedType = challengeType === "leader_personal" || challengeType === "mixed";
    const isLeaderOnlyType = challengeType === "leader_only";
    const isPersonalOnlyType = challengeType === "personal_only";
    let resolvedQuestType: "leader" | "personal" | null = input.questType ?? null;
    if (!resolvedQuestType) {
      if (isLeaderOnlyType) resolvedQuestType = "leader";
      else if (isPersonalOnlyType) resolvedQuestType = "personal";
      // mixed: null → 아래 isExtra 판단에서 처리
    }

    // 리더 퀘스트 제출인데 등록된 퀘스트가 없으면 거부
    if (resolvedQuestType === "leader" && leaderQuestsFetched && totalLeaderQuestCount === 0) {
      return response(400, {
        error: "NO_LEADER_QUESTS_REGISTERED",
        message: "등록된 리더 퀘스트가 없습니다. 리더가 퀘스트를 먼저 등록해야 합니다",
      });
    }

    // 리더 퀘스트 all-done 판단
    // leaderQuestsFetched && count=0 → 퀘스트 미등록 상태 → 완료 불가
    // !leaderQuestsFetched && count=0 → 레거시 챌린지 → boolean 폴백
    function isLeaderAllDone(dp: any): boolean {
      if (!dp) return false;
      if (totalLeaderQuestCount === 0) {
        if (leaderQuestsFetched) return false;
        return dp.leaderQuestDone === true;
      }
      return (dp.leaderQuestIds?.length ?? 0) >= totalLeaderQuestCount;
    }

    // 하루 인증 완료 여부 판단 (challengeType 기반)
    function isDayComplete(dp: any): boolean {
      if (!dp) return false;
      if (isMixedType) return isLeaderAllDone(dp) && dp.personalQuestDone === true;
      if (isLeaderOnlyType) return isLeaderAllDone(dp);
      if (isPersonalOnlyType) return dp.personalQuestDone === true;
      return dp.status === "success";
    }

    // 이미 해당 퀘스트를 오늘 인증했는지 확인 (중복 방지)
    function isQuestAlreadyDone(dp: any, qt: "leader" | "personal" | null, questId?: string | null): boolean {
      if (!dp) return false;
      if (qt === "leader") {
        if (totalLeaderQuestCount === 0) {
          if (leaderQuestsFetched) return false;
          return dp.leaderQuestDone === true;
        }
        const submittedIds: string[] = dp.leaderQuestIds ?? [];
        return questId ? submittedIds.includes(questId) : submittedIds.length >= totalLeaderQuestCount;
      }
      if (qt === "personal") return dp.personalQuestDone === true;
      return dp.status === "success";
    }

    const isExtra = isDayComplete(dayProgress) ||
      (resolvedQuestType !== null && isQuestAlreadyDone(dayProgress, resolvedQuestType, input.questId));

    const verificationDate =
      input.verificationDate || practiceValidation.certDate;

    const personalTarget = userChallenge.personalTarget;
    const effectiveTime24 = personalTarget?.time24 || challengeTargetTime24;
    const effectiveTimezone = personalTarget?.timezone || timezone;
    const derivedTargetTime = effectiveTime24
      ? buildTargetDateTimeISO(
          verificationDate,
          effectiveTime24,
          effectiveTimezone,
        )
      : undefined;

    if (personalTarget?.time24 && !derivedTargetTime && !input.targetTime) {
      return response(400, {
        error: "INVALID_PERSONAL_TARGET_TIME",
        message: "개인 목표시간 형식이 올바르지 않습니다. 다시 설정해주세요",
      });
    }

    const effectiveTargetTime = input.targetTime || derivedTargetTime;

    const delta =
      isExtra || !effectiveTargetTime
        ? null
        : calculateDelta(effectiveTargetTime, performedAt);

    if (effectiveTargetTime && !isExtra && delta === null) {
      return response(400, {
        error: "INVALID_TARGET_TIME_FORMAT",
        message: "인증 시각 또는 목표 시각 형식이 올바르지 않습니다",
      });
    }

    // 이 인증으로 하루가 완료되는지 미리 판단 (score / 응원·감사 집계 기준)
    const _existingLeaderQuestIds: string[] = dayProgress?.leaderQuestIds ?? [];
    const _newLeaderQuestIds: string[] =
      resolvedQuestType === "leader" && input.questId && !_existingLeaderQuestIds.includes(input.questId)
        ? [..._existingLeaderQuestIds, input.questId]
        : _existingLeaderQuestIds;
    const _leaderDone: boolean = resolvedQuestType === "leader"
      ? (totalLeaderQuestCount === 0
          ? (leaderQuestsFetched ? false : true)
          : _newLeaderQuestIds.length >= totalLeaderQuestCount)
      : (dayProgress?.leaderQuestDone === true);
    const _personalDone: boolean =
      resolvedQuestType === "personal" ? true : (dayProgress?.personalQuestDone === true);
    // personal_only: 개인 퀘스트 1개 제출로 완료 (기존 `: true` fallthrough 버그 수정)
    const dayNowComplete: boolean = isMixedType
      ? _leaderDone && _personalDone
      : isLeaderOnlyType ? _leaderDone
      : isPersonalOnlyType ? _personalDone
      : true;

    // 응원·감사 집계는 당일 모든 퀘스트 완료 시점에만 적용
    const isEarlyCompletion = !isExtra && dayNowComplete && (delta || 0) > 0;

    const verificationId = uuidv4();

    const verification = {
      verificationId,
      userId,
      userChallengeId: input.userChallengeId,
      challengeId,
      challengeTitle,
      challengeCategory,
      day: input.day,
      type: "normal",
      verificationType,
      imageUrl: input.imageUrl || null,
      videoUrl:
        input.videoUrl ||
        (verificationType === "video" ? input.imageUrl || null : null),
      videoDurationSec: input.videoDurationSec ?? null,
      trimStartSec: input.trimStartSec ?? null,
      trimEndSec: input.trimEndSec ?? null,
      videoObjectKey: input.videoObjectKey ?? null,
      mediaValidationStatus:
        verificationType === "video"
          ? input.mediaValidationStatus || "pending"
          : null,
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
      score: (isExtra || !dayNowComplete) ? 0 : 1,
      scoreEarned: (isExtra || !dayNowComplete) ? 0 : 1,
      cheerCount: 0,
      isPublic: input.isPublic ? "true" : "false",
      isAnonymous: input.isAnonymous,
      originalDay: null,
      reflectionNote: null,
      questType: resolvedQuestType,
      isExtra,
      primaryVerificationId: isExtra
        ? dayProgress?.verificationId || null
        : null,
      isPersonalOnly: isExtra ? true : false,
      ...(input.hashtag ? { hashtag: input.hashtag.replace(/^#+/, "").trim() } : {}),
      createdAt: nowIso,
    };

    await docClient.send(
      new PutCommand({
        TableName: process.env.VERIFICATIONS_TABLE!,
        Item: verification,
        ConditionExpression: "attribute_not_exists(verificationId)",
      }),
    );

    // 해쉬태그 레지스트리 — 최초 등록자 기록
    if (input.hashtag && process.env.HASHTAGS_TABLE) {
      const cleanHashtag = input.hashtag.replace(/^#+/, "").trim();
      if (cleanHashtag) {
        const ANIMALS = ['🐰', '🐻', '🦊', '🐼', '🦁', '🐯', '🐨', '🦦'];
        const iconSum = [...userId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const creatorAnimalIcon = ANIMALS[iconSum % ANIMALS.length];

        // 이미 존재하면 ConditionalCheckFailedException — 무시
        await docClient.send(new PutCommand({
          TableName: process.env.HASHTAGS_TABLE,
          Item: {
            hashtag: cleanHashtag,
            creatorUserId: userId,
            creatorAnimalIcon,
            registeredAt: nowIso,
            creatorPublic: true,
            postCount: 0,
          },
          ConditionExpression: 'attribute_not_exists(hashtag)',
        })).catch((err: any) => {
          if (err?.name !== 'ConditionalCheckFailedException') throw err;
        });

        // postCount 증분
        await docClient.send(new UpdateCommand({
          TableName: process.env.HASHTAGS_TABLE,
          Key: { hashtag: cleanHashtag },
          UpdateExpression: 'SET postCount = if_not_exists(postCount, :zero) + :inc',
          ExpressionAttributeValues: { ':inc': 1, ':zero': 0 },
        }));
      }
    }

    if (isExtra) {
      return response(200, {
        success: true,
        message: "오늘의 추가 기록이 저장되었어요 📝",
        data: {
          verificationId,
          isExtra: true,
          scoreEarned: 0,
          delta: null,
          cheerOpportunity: null,
          notice: "점수와 응원 혜택은 오늘의 첫 번째 완료 인증에만 적용됩니다.",
        },
      });
    }

    const updatedProgress = [...progress];
    const existingIndex = updatedProgress.findIndex(
      (p: any) => Number(p?.day) === input.day,
    );

    // 기존 progress 항목 기반으로 questType 플래그 업데이트
    const existingDayEntry = existingIndex >= 0 ? updatedProgress[existingIndex] : null;

    // 리더 퀘스트 ID 배열 누적 (중복 제거)
    const existingLeaderQuestIds: string[] = existingDayEntry?.leaderQuestIds ?? [];
    const leaderQuestIds: string[] = resolvedQuestType === "leader" && input.questId && !existingLeaderQuestIds.includes(input.questId)
      ? [...existingLeaderQuestIds, input.questId]
      : existingLeaderQuestIds;

    const leaderQuestDone: boolean | undefined = resolvedQuestType === "leader"
      ? (totalLeaderQuestCount === 0
          ? (leaderQuestsFetched ? false : true)
          : leaderQuestIds.length >= totalLeaderQuestCount)
      : (existingDayEntry?.leaderQuestDone ?? (isLeaderOnlyType ? false : undefined));
    const personalQuestDone = resolvedQuestType === "personal"
      ? true
      : (existingDayEntry?.personalQuestDone ?? (isPersonalOnlyType ? false : undefined));

    // 하루 완료 전이면 partial 처리 후 early return
    if (!dayNowComplete) {
      const partialEntry = {
        ...(existingDayEntry ?? {}),
        day: input.day,
        status: "partial",
        verificationId: existingDayEntry?.verificationId ?? verificationId,
        timestamp: existingDayEntry?.timestamp ?? performedAt,
        delta: 0,
        score: 0,
        leaderQuestIds,
        leaderQuestDone: leaderQuestDone === true,
        personalQuestDone: personalQuestDone === true,
        ...(resolvedQuestType === "leader" ? { leaderVerificationId: verificationId } : {}),
        ...(resolvedQuestType === "personal" ? { personalVerificationId: verificationId } : {}),
      };
      if (existingIndex >= 0) {
        updatedProgress[existingIndex] = partialEntry;
      } else {
        updatedProgress.push(partialEntry);
      }
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.USER_CHALLENGES_TABLE!,
            Key: { userChallengeId: input.userChallengeId },
            UpdateExpression: "SET progress = :progress, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
              ":progress": updatedProgress,
              ":updatedAt": nowIso,
            },
          }),
        );
      } catch (partialWriteErr: any) {
        console.error("Partial progress write error (non-fatal):", partialWriteErr?.message);
      }
      const partialMsg = isMixedType
        ? (resolvedQuestType === "leader"
            ? "리더 퀘스트 인증 완료! 개인 퀘스트도 인증해야 오늘 인증이 완료됩니다 🎯"
            : "개인 퀘스트 인증 완료! 리더 퀘스트도 인증해야 오늘 인증이 완료됩니다 🎯")
        : `리더 퀘스트 ${leaderQuestIds.length}/${totalLeaderQuestCount} 완료! 나머지 리더 퀘스트도 인증해야 오늘이 완료됩니다 🎯`;
      return response(200, {
        success: true,
        message: partialMsg,
        data: {
          verificationId,
          isExtra: false,
          isDayComplete: false,
          questType: resolvedQuestType,
          scoreEarned: 0,
          delta: null,
          cheerOpportunity: null,
        },
      });
    }

    const newProgress = {
      day: input.day,
      status: dayNowComplete ? "success" : "partial",
      verificationId,
      timestamp: performedAt,
      delta: dayNowComplete ? (delta || 0) : 0,
      score: dayNowComplete ? 1 : 0,
      leaderQuestIds,
      leaderQuestDone: leaderQuestDone ?? false,
      personalQuestDone: personalQuestDone ?? false,
      ...(isMixedType && resolvedQuestType === "leader" ? { leaderVerificationId: verificationId } : {}),
      ...(isMixedType && resolvedQuestType === "personal" ? { personalVerificationId: verificationId } : {}),
    };

    if (existingIndex >= 0) {
      updatedProgress[existingIndex] = newProgress;
    } else {
      updatedProgress.push(newProgress);
    }

    let consecutiveDays = 0;
    for (let i = 1; i <= input.day; i++) {
      const p = updatedProgress.find((pr: any) => Number(pr?.day) === i);
      if (p && p.status === "success") {
        consecutiveDays++;
      } else {
        break;
      }
    }

    const totalScore = updatedProgress
      .filter((p: any) => p.status === "success")
      .reduce((sum: number, p: any) => sum + (p.score || 0), 0);

    // nextDay: durationDays 기반으로 cap (하드코딩 8 제거)
    const maxDay = challengeDurationDays + 1;
    const nextDay = Math.min(maxDay, input.day + 1);

    await docClient.send(
      new UpdateCommand({
        TableName: process.env.USER_CHALLENGES_TABLE!,
        Key: { userChallengeId: input.userChallengeId },
        UpdateExpression:
          "SET progress = :progress, currentDay = :currentDay, score = :score, consecutiveDays = :consecutiveDays, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":progress": updatedProgress,
          ":currentDay": nextDay,
          ":score": totalScore,
          ":consecutiveDays": consecutiveDays,
          ":updatedAt": nowIso,
        },
      }),
    );

    let cheerOpportunity = {
      hasIncompletePeople: false,
      incompleteCount: 0,
    };

    const eligibleCheerIds: string[] = [];

    if (isEarlyCompletion && userChallenge.groupId) {
      try {
        const membersResult = await docClient.send(new QueryCommand({
          TableName: process.env.USER_CHALLENGES_TABLE!,
          IndexName: "groupId-index",
          KeyConditionExpression: "groupId = :groupId",
          ExpressionAttributeValues: { ":groupId": userChallenge.groupId },
        }));

        const incompleteMembers = (membersResult.Items || []).filter((member: any) => {
          if (member.userId === userId || member.status !== "active") return false;
          const mp = normalizeProgress(member.progress);
          const todayEntry = mp.find((p: any) => Number(p.day) === input.day);
          return !isDayComplete(todayEntry);
        });

        if (incompleteMembers.length === 0) {
          // 전원 완료 보너스: 마지막 완료자가 조기 완료한 경우
          const allActive = (membersResult.Items || []).filter((m: any) => m.status === "active");
          const completedCount =
            allActive.filter((m: any) => {
              const mp = normalizeProgress(m.progress);
              return isDayComplete(mp.find((p: any) => Number(p.day) === input.day));
            }).length + 1; // +1 = 자신

          // 마지막 완료자(자신) thankScore += completedCount
          await docClient.send(new UpdateCommand({
            TableName: process.env.USER_CHALLENGES_TABLE!,
            Key: { userChallengeId: userChallenge.userChallengeId },
            UpdateExpression: "ADD thankScore :n SET updatedAt = :now",
            ExpressionAttributeValues: { ":n": completedCount, ":now": nowIso },
          }));

          // 전체 참여자 cheerScore (리더 10배)
          const selfCheer = userId === challengeCreatorId ? completedCount * 10 : completedCount;
          await docClient.send(new UpdateCommand({
            TableName: process.env.USER_CHALLENGES_TABLE!,
            Key: { userChallengeId: userChallenge.userChallengeId },
            UpdateExpression: "ADD cheerScore :n SET updatedAt = :now",
            ExpressionAttributeValues: { ":n": selfCheer, ":now": nowIso },
          }));

          for (const member of allActive) {
            if (!member.userChallengeId) continue;
            const memberCheer = member.userId === challengeCreatorId ? completedCount * 10 : completedCount;
            await docClient.send(new UpdateCommand({
              TableName: process.env.USER_CHALLENGES_TABLE!,
              Key: { userChallengeId: member.userChallengeId },
              UpdateExpression: "ADD cheerScore :n SET updatedAt = :now",
              ExpressionAttributeValues: { ":n": memberCheer, ":now": nowIso },
            }));
          }

          cheerOpportunity = {
            hasIncompletePeople: false,
            incompleteCount: 0,
            cheerTicketGranted: false,
            allGroupComplete: true,
            completedCount,
          };
        } else {
          // 미완료 멤버 있음 → auto-cheer 생성
          const senderAlias = randomAlias();
          for (const member of incompleteMembers) {
            const memberTarget24 = member.personalTarget?.time24 || challengeTargetTime24;
            const createdCheerId = await createAutoCheer({
              senderId: userId,
              receiverId: member.userId,
              challengeId,
              verificationId,
              delta: delta || 0,
              senderAlias,
              memberTarget24,
              verificationDate,
              memberTimezone: member.personalTarget?.timezone || timezone,
              nowISO: nowIso,
              day: input.day,
            });
            if (createdCheerId) eligibleCheerIds.push(createdCheerId);
          }

          // 발송한 응원 수만큼 cheerScore 즉시 지급 (creator면 ×10)
          const cheerCount = incompleteMembers.length;
          const cheerGain = userId === challengeCreatorId ? cheerCount * 10 : cheerCount;
          if (cheerGain > 0) {
            await docClient.send(new UpdateCommand({
              TableName: process.env.USER_CHALLENGES_TABLE!,
              Key: { userChallengeId: userChallenge.userChallengeId },
              UpdateExpression: "ADD cheerScore :n SET updatedAt = :now",
              ExpressionAttributeValues: { ":n": cheerGain, ":now": nowIso },
            }));
          }

          cheerOpportunity = {
            hasIncompletePeople: true,
            incompleteCount: incompleteMembers.length,
            cheerTicketGranted: true,
          };
        }
      } catch (cheerError) {
        console.error("Auto cheer creation error:", cheerError);
      }
    }

    const newBadges = await grantBadges({
      userId,
      challengeId,
      verificationId,
      day: input.day,
      consecutiveDays,
      isRemedy: false,
    }).catch((badgeError: any) => {
      console.error("Badge grant error (non-fatal):", badgeError);
      return [] as string[];
    });

    // 수신자(나)가 당일 인증 완료 시 → 내게 보낸 status='sent' 응원의 발신자 감사 점수 적립
    if (!isExtra && process.env.CHEERS_TABLE) {
      try {
        const receivedCheersResult = await docClient.send(new QueryCommand({
          TableName: process.env.CHEERS_TABLE!,
          IndexName: "receiverId-index",
          KeyConditionExpression: "receiverId = :userId",
          FilterExpression:
            "challengeId = :challengeId AND #day = :day AND #status = :sent AND (attribute_not_exists(isThankScoreGranted) OR isThankScoreGranted = :false)",
          ExpressionAttributeNames: {
            "#status": "status",
            "#day": "day",
          },
          ExpressionAttributeValues: {
            ":userId": userId,
            ":challengeId": challengeId,
            ":day": input.day,
            ":sent": "sent",
            ":false": false,
          },
        }));

        for (const cheer of (receivedCheersResult.Items ?? [])) {
          await Promise.allSettled([
            docClient.send(new UpdateCommand({
              TableName: process.env.CHEERS_TABLE!,
              Key: { cheerId: cheer.cheerId },
              UpdateExpression: "SET #status = :done, isThankScoreGranted = :true, thankScoreGrantedAt = :now",
              ConditionExpression: "#status = :sent",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":done": "receiver_completed",
                ":sent": "sent",
                ":true": true,
                ":now": nowIso,
              },
            })),
            (async () => {
              const senderResult = await docClient.send(new QueryCommand({
                TableName: process.env.USER_CHALLENGES_TABLE!,
                IndexName: "userId-index",
                KeyConditionExpression: "userId = :senderId",
                FilterExpression: "challengeId = :challengeId",
                ExpressionAttributeValues: {
                  ":senderId": cheer.senderId,
                  ":challengeId": challengeId,
                },
              }));
              const senderChallenge = senderResult.Items?.[0];
              if (senderChallenge?.userChallengeId) {
                await docClient.send(new UpdateCommand({
                  TableName: process.env.USER_CHALLENGES_TABLE!,
                  Key: { userChallengeId: senderChallenge.userChallengeId },
                  UpdateExpression: "ADD thankScore :one SET updatedAt = :now",
                  ExpressionAttributeValues: { ":one": 1, ":now": nowIso },
                }));
              }
            })(),
          ]);
        }
      } catch (e) {
        console.error("Failed to grant thank scores on receiver completion:", e);
      }
    }

    const message = isEarlyCompletion
      ? `Day ${input.day} 완료! 목표보다 ${delta}분 일찍!`
      : `Day ${input.day} 완료!`;

    return response(200, {
      success: true,
      message,
      data: {
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
        newBadges,
        eligibleCheerIds,
      },
    });
  } catch (error: any) {
    console.error("Verification submit error:", {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      statusCode: error?.$metadata?.httpStatusCode,
      stack: error?.stack,
    });

    if (error instanceof z.ZodError) {
      return response(400, {
        error: "VALIDATION_ERROR",
        message: "입력값이 올바르지 않습니다",
        details: error.errors,
      });
    }

    return response(500, {
      error: "INTERNAL_SERVER_ERROR",
      message: "서버 오류가 발생했습니다",
    });
  }
};
