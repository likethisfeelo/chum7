// backend/services/verification/remedy/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { certDateFromIso, remedyScore, safeTimezone, calculateChallengeDay } from '../../../shared/lib/challenge-quest-policy';
import { normalizeProgress } from '../../../shared/lib/progress';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const remedySchema = z.object({
  userChallengeId: z.string().uuid(),
  originalDay: z.number().int().min(1).max(30),
  // 인증 방식 — 챌린지 allowedVerificationTypes와 동일하게 적용
  verificationType: z.enum(['image', 'text', 'link', 'video']).optional(),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  linkUrl: z.string().url().optional(),
  todayNote: z.string().max(500).optional(),
  reflectionNote: z.string().max(500).optional(),  // 보완 회고 (선택)
  tomorrowPromise: z.string().max(500).optional(),
  completedAt: z.string().datetime().optional(),
  practiceAt: z.string().datetime().optional(),
});

type RemedyInput = z.infer<typeof remedySchema>;
type VerificationType = 'image' | 'text' | 'link' | 'video';

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

function resolveVerificationType(input: RemedyInput): VerificationType {
  if (input.verificationType) return input.verificationType;
  if (input.linkUrl) return 'link';
  if (input.videoUrl) return 'video';
  if (input.imageUrl) return 'image';
  return 'text';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const body = JSON.parse(event.body || '{}');
    const input: RemedyInput = remedySchema.parse(body);

    // 1. UserChallenge 조회
    const userChallengeResult = await docClient.send(new GetCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId: input.userChallengeId },
    }));

    if (!userChallengeResult.Item) {
      return response(404, { error: 'USER_CHALLENGE_NOT_FOUND', message: '챌린지를 찾을 수 없습니다' });
    }

    const userChallenge = userChallengeResult.Item;

    if (userChallenge.userId !== userId) {
      return response(403, { error: 'FORBIDDEN', message: '본인의 챌린지만 보완할 수 있습니다' });
    }

    // 2. Challenge 조회 (정책·durationDays·allowedVerificationTypes)
    const challengeResult = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId: userChallenge.challengeId },
    }));

    if (!challengeResult.Item) {
      return response(404, { error: 'CHALLENGE_NOT_FOUND', message: '챌린지 정보를 찾을 수 없습니다' });
    }

    const challenge = challengeResult.Item;
    const durationDays = Number(challenge.durationDays ?? 7);
    const remedyPolicy = challenge.defaultRemedyPolicy ?? { type: 'anytime', maxRemedyDays: null };
    const remedyPolicyType: 'anytime' | 'last_day' | 'disabled' = remedyPolicy.type ?? 'anytime';

    // last_day 정책: 마지막 날이 보완 전용 → 정규 인증 day = durationDays - 1
    const regularDays = remedyPolicyType === 'last_day' ? durationDays - 1 : durationDays;

    // 3. 정책 타입 확인
    if (remedyPolicyType === 'disabled') {
      return response(400, { error: 'REMEDY_NOT_ALLOWED', message: '이 챌린지는 보완이 허용되지 않습니다' });
    }

    // 4. effectiveCurrentDay 계산
    const nowIso = new Date().toISOString();
    const timezone = safeTimezone(
      ((event.headers?.['x-user-timezone'] || event.headers?.['X-User-Timezone']) as string | undefined) ||
        userChallenge.timezone,
    );
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

    // 5. 정책별 보완 가능 날짜 검증
    if (remedyPolicyType === 'last_day') {
      // 마지막 날(durationDays)에만 보완 가능
      if (effectiveCurrentDay !== durationDays) {
        return response(400, {
          error: 'REMEDY_WRONG_DAY',
          message: `Day ${durationDays}에만 보완 인증이 가능합니다`,
        });
      }
    } else {
      // anytime: Day 2부터 가능 (오늘보다 이전 날만 보완 가능)
      if (effectiveCurrentDay < 2) {
        return response(400, {
          error: 'REMEDY_WRONG_DAY',
          message: 'Day 2부터 보완 인증이 가능합니다',
        });
      }
    }

    // 6. originalDay 범위 검증
    if (input.originalDay > regularDays) {
      return response(400, {
        error: 'REMEDY_TARGET_INVALID',
        message: `보완 가능한 최대 day는 ${regularDays}입니다`,
      });
    }
    // anytime: 현재 day보다 미래 날은 보완 불가
    if (remedyPolicyType === 'anytime' && input.originalDay >= effectiveCurrentDay) {
      return response(400, {
        error: 'REMEDY_TARGET_INVALID',
        message: '아직 완료되지 않은 day는 보완할 수 없습니다',
      });
    }

    // 7. 실패일 확인
    const progress = normalizeProgress(userChallenge.progress);
    const failedDays = progress.filter((p: any) => p.status !== 'success' && p.day <= regularDays);
    if (failedDays.length === 0) {
      return response(400, { error: 'REMEDY_NO_FAILED_DAYS', message: '보완할 실패일이 없습니다' });
    }

    const originalDayProgress = progress.find((p: any) => Number(p.day) === input.originalDay);
    if (!originalDayProgress || originalDayProgress.status === 'success') {
      return response(400, {
        error: 'REMEDY_TARGET_INVALID',
        message: '보완 대상 day가 실제 실패일이 아닙니다',
      });
    }

    if (originalDayProgress.remedied) {
      return response(409, { error: 'REMEDY_TARGET_ALREADY_DONE', message: '이미 보완한 day입니다' });
    }

    // 8. last_day 정책의 maxRemedyDays 적용
    const alreadyRemediedCount = progress.filter((p: any) => p.remedied === true).length;
    if (remedyPolicyType === 'last_day' && remedyPolicy.maxRemedyDays !== null) {
      if (alreadyRemediedCount >= remedyPolicy.maxRemedyDays) {
        return response(409, {
          error: 'REMEDY_MAX_REACHED',
          message: `최대 보완 횟수(${remedyPolicy.maxRemedyDays}회)에 도달했습니다`,
        });
      }
    }

    // 9. 인증 방식 검증 (챌린지 allowedVerificationTypes 기준)
    const allowedTypes: VerificationType[] = ['image', 'text', 'link', 'video'];
    const rawAllowedTypes = challenge.allowedVerificationTypes;
    if (Array.isArray(rawAllowedTypes) && rawAllowedTypes.length > 0) {
      const sanitized = rawAllowedTypes.filter((t: string) =>
        ['image', 'text', 'link', 'video'].includes(t),
      ) as VerificationType[];
      if (sanitized.length > 0) allowedTypes.splice(0, allowedTypes.length, ...sanitized);
    }

    const verificationType = resolveVerificationType(input);
    if (!allowedTypes.includes(verificationType)) {
      return response(400, {
        error: 'UNSUPPORTED_VERIFICATION_TYPE',
        message: `해당 챌린지에서는 ${verificationType} 인증이 허용되지 않습니다. 허용: ${allowedTypes.join(', ')}`,
      });
    }

    // 인증 방식별 필수 콘텐츠 확인
    if (verificationType === 'image' && !input.imageUrl) {
      return response(400, { error: 'MISSING_CONTENT', message: '이미지 URL이 필요합니다' });
    }
    if (verificationType === 'video' && !input.videoUrl && !input.imageUrl) {
      return response(400, { error: 'MISSING_CONTENT', message: '영상 URL이 필요합니다' });
    }
    if (verificationType === 'link' && !input.linkUrl) {
      return response(400, { error: 'MISSING_CONTENT', message: '링크 URL이 필요합니다' });
    }
    if (verificationType === 'link' && input.linkUrl && !input.linkUrl.startsWith('https://')) {
      return response(400, { error: 'INSECURE_LINK', message: '링크는 https://로 시작해야 합니다' });
    }

    // 10. practiceAt 미래 시간 차단 (클라이언트 시계 편차 60초 허용)
    const CLOCK_SKEW_TOLERANCE_MS = 60_000;
    const performedAtRaw = input.practiceAt || input.completedAt || nowIso;
    const _performedAtMs = new Date(performedAtRaw).getTime();
    const _nowMs = new Date(nowIso).getTime();
    // 클라이언트 시계가 서버보다 최대 60초 앞선 경우 서버 시각으로 대체 (오탐 방지)
    const performedAt =
      _performedAtMs > _nowMs && _performedAtMs - _nowMs <= CLOCK_SKEW_TOLERANCE_MS
        ? nowIso
        : performedAtRaw;
    if (new Date(performedAt).getTime() > new Date(nowIso).getTime()) {
      return response(400, { error: 'FUTURE_PRACTICE_TIME', message: 'practiceAt이 현재 시간보다 미래입니다' });
    }
    const certDate = certDateFromIso(nowIso, timezone);

    // 11. 보완 인증 레코드 생성
    const verificationId = uuidv4();
    const basePoints = Number(originalDayProgress.score || 1);
    const scoreEarned = Math.max(1, remedyScore(basePoints));

    const verification = {
      verificationId,
      userId,
      userChallengeId: input.userChallengeId,
      challengeId: userChallenge.challengeId,
      day: effectiveCurrentDay,
      type: 'remedy',
      verificationType,
      imageUrl: input.imageUrl || null,
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
    };

    await docClient.send(new PutCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Item: verification,
    }));

    // 12. progress 업데이트: originalDay를 성공(remedied)으로 마킹
    const updatedProgress = [...progress];
    const originalIndex = updatedProgress.findIndex((p: any) => Number(p.day) === input.originalDay);

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
      .filter((p: any) => p.status === 'success')
      .reduce((sum: number, p: any) => sum + (p.score || 0), 0);

    await docClient.send(new UpdateCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId: input.userChallengeId },
      UpdateExpression: 'SET progress = :progress, score = :score, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':progress': updatedProgress,
        ':score': totalScore,
        ':updatedAt': nowIso,
      },
    }));

    // 남은 보완 횟수 계산
    let remainingRemedyDays: number;
    if (remedyPolicyType === 'last_day' && remedyPolicy.maxRemedyDays !== null) {
      remainingRemedyDays = Math.max(remedyPolicy.maxRemedyDays - (alreadyRemediedCount + 1), 0);
    } else {
      remainingRemedyDays = Math.max(failedDays.length - (alreadyRemediedCount + 1), 0);
    }

    return response(200, {
      success: true,
      message: `Day ${input.originalDay} 보완 완료!`,
      data: {
        verificationId,
        originalDay: input.originalDay,
        verificationType,
        scoreEarned,
        totalScore,
        remainingRemedyDays,
        newBadges: [],
      },
    });

  } catch (error: any) {
    console.error('Remedy verification error:', error);

    if (error instanceof z.ZodError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors,
      });
    }

    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
