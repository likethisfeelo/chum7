// backend/services/verification/submit/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
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
import { inferVerificationType } from "../../../shared/lib/verification-type";
import { isValidTrimRange } from "../../../shared/lib/trim-validation";
import { normalizeProgress } from "../../../shared/lib/progress";
import { grantBadges } from "../../../shared/lib/badge-grant";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({});

const submitSchema = z.object({
  userChallengeId: z.string().uuid(),
  day: z.number().min(1).max(30),
  verificationType: z.enum(["text", "image", "video", "link"]).optional(),
  questType: z.enum(["leader", "personal"]).optional(),
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

export function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify(body),
  };
}

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

async function createCheerTicket(
  userId: string,
  challengeId: string,
  verificationId: string,
  delta: number,
  source: string,
): Promise<void> {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const ticket = {
    ticketId: uuidv4(),
    userId,
    source,
    challengeId,
    verificationId,
    delta,
    status: "available",
    usedAt: null,
    usedForCheerId: null,
    expiresAt: tomorrow.toISOString(),
    expiresAtTimestamp: Math.floor(tomorrow.getTime() / 1000),
    createdAt: now.toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: process.env.USER_CHEER_TICKETS_TABLE!,
      Item: ticket,
    }),
  );
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
}): Promise<void> {
  if (!process.env.CHEERS_TABLE) return;
  const {
    senderId, receiverId, challengeId, verificationId, delta, senderAlias,
    memberTarget24, verificationDate, memberTimezone, nowISO,
  } = params;

  if (!memberTarget24) return;

  const memberTargetISO = buildTargetDateTimeISO(verificationDate, memberTarget24, memberTimezone);
  if (!memberTargetISO) return;

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
            title: "응원이 도착했어요! 💪",
            body: `${senderAlias}님이 응원을 보냈어요!`,
            data: { type: "cheer_immediate", timestamp: nowISO },
          },
        }),
      }));
    } catch (snsErr) {
      console.error("Auto cheer SNS error (non-fatal):", snsErr);
    }
  }
}

async function autoThankReceivedCheers(
  userId: string,
  challengeId: string,
  nowISO: string,
): Promise<void> {
  if (!process.env.CHEERS_TABLE) return;

  const result = await docClient.send(new QueryCommand({
    TableName: process.env.CHEERS_TABLE!,
    IndexName: "receiverId-index",
    KeyConditionExpression: "receiverId = :userId",
    FilterExpression: "challengeId = :challengeId AND isThanked = :false AND #status = :sent",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":userId": userId,
      ":challengeId": challengeId,
      ":false": false,
      ":sent": "sent",
    },
  }));

  for (const cheer of (result.Items || [])) {
    try {
      await docClient.send(new UpdateCommand({
        TableName: process.env.CHEERS_TABLE!,
        Key: { cheerId: cheer.cheerId },
        UpdateExpression: "SET isThanked = :true, thankedAt = :now",
        ConditionExpression: "isThanked = :false AND receiverId = :userId",
        ExpressionAttributeValues: {
          ":true": true,
          ":false": false,
          ":userId": userId,
          ":now": nowISO,
        },
      }));
      if (process.env.SNS_TOPIC_ARN) {
        await snsClient.send(new PublishCommand({
          TopicArn: process.env.SNS_TOPIC_ARN!,
          Message: JSON.stringify({
            userId: cheer.senderId,
            notification: {
              title: "당신의 응원이 힘이 됐어요! ❤️",
              body: "응원한 분이 목표 시간 전에 인증했어요!",
              data: { type: "cheer_thanked", timestamp: nowISO },
            },
          }),
        }));
      }
    } catch (e: any) {
      if (e?.name !== "ConditionalCheckFailedException") {
        console.error("Auto-thank single cheer error:", e);
      }
    }
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || "{}");
    const input: SubmitInput = submitSchema.parse(body);
    const verificationType = inferVerificationType(input);

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
      } catch (challengeErr: any) {
        console.warn("Failed to fetch challenge data (non-fatal):", {
          challengeId,
          name: challengeErr?.name,
          message: challengeErr?.message,
        });
      }
    }

    if (!allowedTypes.includes(verificationType)) {
      return response(400, {
        error: "UNSUPPORTED_VERIFICATION_TYPE",
        message: `해당 챌린지에서는 ${verificationType} 인증이 허용되지 않습니다`,
      });
    }

    const nowIso = new Date().toISOString();
    const performedAt = input.performedAt || input.completedAt || nowIso;
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

    // 하루 인증 완료 여부 판단 (challengeType 기반)
    function isDayComplete(dp: any): boolean {
      if (!dp) return false;
      if (isMixedType) {
        return dp.leaderQuestDone === true && dp.personalQuestDone === true;
      }
      if (isLeaderOnlyType) return dp.leaderQuestDone === true;
      if (isPersonalOnlyType) return dp.personalQuestDone === true;
      // fallback: 기존 status 방식
      return dp.status === "success";
    }

    // 이미 해당 퀘스트 타입을 오늘 인증했는지 확인 (혼합형에서 같은 퀘스트 중복 방지)
    function isQuestAlreadyDone(dp: any, qt: "leader" | "personal" | null): boolean {
      if (!dp) return false;
      if (qt === "leader") return dp.leaderQuestDone === true;
      if (qt === "personal") return dp.personalQuestDone === true;
      // questType 미지정 + 기존 완료 상태
      return dp.status === "success";
    }

    const isExtra = isDayComplete(dayProgress) || (isMixedType && resolvedQuestType !== null && isQuestAlreadyDone(dayProgress, resolvedQuestType));

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

    const isEarlyCompletion = !isExtra && (delta || 0) > 0;

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
      score: isExtra ? 0 : 1,
      scoreEarned: isExtra ? 0 : 1,
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
      createdAt: nowIso,
    };

    await docClient.send(
      new PutCommand({
        TableName: process.env.VERIFICATIONS_TABLE!,
        Item: verification,
      }),
    );

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
    const leaderQuestDone = resolvedQuestType === "leader"
      ? true
      : (existingDayEntry?.leaderQuestDone ?? (isLeaderOnlyType ? false : undefined));
    const personalQuestDone = resolvedQuestType === "personal"
      ? true
      : (existingDayEntry?.personalQuestDone ?? (isPersonalOnlyType ? false : undefined));

    // 이 인증으로 하루 완료가 되는지 판단
    const dayNowComplete = isMixedType
      ? leaderQuestDone === true && personalQuestDone === true
      : true; // single-quest type: 이 인증이 첫 번째 유효 인증이므로 완료

    // 혼합형에서 첫 번째 퀘스트 인증은 partial → progress 기록 후 안내 반환
    if (isMixedType && !dayNowComplete) {
      const partialEntry = {
        ...(existingDayEntry ?? {}),
        day: input.day,
        status: "partial",
        verificationId: existingDayEntry?.verificationId ?? verificationId,
        timestamp: existingDayEntry?.timestamp ?? performedAt,
        delta: 0,
        score: 0,
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
      return response(200, {
        success: true,
        message: resolvedQuestType === "leader"
          ? "리더 퀘스트 인증 완료! 개인 퀘스트도 인증해야 오늘 인증이 완료됩니다 🎯"
          : "개인 퀘스트 인증 완료! 리더 퀘스트도 인증해야 오늘 인증이 완료됩니다 🎯",
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
      canCheerNow: false,
      cheerTicketGranted: false,
    };

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

        const senderAlias = randomAlias();
        for (const member of incompleteMembers) {
          const memberTarget24 = member.personalTarget?.time24 || challengeTargetTime24;
          await createAutoCheer({
            senderId: userId,
            receiverId: member.userId,
            challengeId,
            verificationId,
            delta: delta || 0,
            senderAlias,
            memberTarget24,
            verificationDate,
            memberTimezone: member.personalTarget?.timezone || timezone,
            nowISO,
          });
        }

        cheerOpportunity = {
          hasIncompletePeople: incompleteMembers.length > 0,
          incompleteCount: incompleteMembers.length,
          canCheerNow: false,
          cheerTicketGranted: false,
        };
      } catch (cheerError) {
        console.error("Auto cheer creation error:", cheerError);
      }
    }

    if (consecutiveDays === 3) {
      try {
        await createCheerTicket(
          userId,
          challengeId,
          verificationId,
          delta || 0,
          "streak_3",
        );
        cheerOpportunity.cheerTicketGranted = true;
      } catch (cheerError) {
        console.error("Streak cheer ticket error:", cheerError);
      }
    }

    if (input.day === challengeDurationDays && consecutiveDays === challengeDurationDays) {
      try {
        for (let i = 0; i < 3; i++) {
          await createCheerTicket(
            userId,
            challengeId,
            verificationId,
            delta || 0,
            "complete",
          );
        }
        cheerOpportunity.cheerTicketGranted = true;
      } catch (cheerError) {
        console.error("Complete cheer ticket error:", cheerError);
      }
    }

    if (isEarlyCompletion) {
      try {
        await autoThankReceivedCheers(userId, challengeId, nowISO);
      } catch (thankError) {
        console.error("Auto-thank error (non-fatal):", thankError);
      }
    }

    let newBadges: string[] = [];
    try {
      newBadges = await grantBadges({
        userId,
        challengeId,
        verificationId,
        day: input.day,
        consecutiveDays,
        isRemedy: false,
      });
    } catch (badgeError) {
      console.error("Badge grant error (non-fatal):", badgeError);
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
