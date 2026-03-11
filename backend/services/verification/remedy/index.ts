// backend/services/verification/remedy/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { certDateFromIso, remedyScore, safeTimezone } from '../../../shared/lib/challenge-quest-policy';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const remedySchema = z.object({
  userChallengeId: z.string().uuid(),
  originalDay: z.number().min(1).max(5),
  imageUrl: z.string().url().optional(),
  reflectionNote: z.string().min(10).max(500),
  todayNote: z.string().min(1).max(500),
  tomorrowPromise: z.string().max(500).optional(),
  completedAt: z.string().datetime().optional(),
  practiceAt: z.string().datetime().optional()
});

type RemedyInput = z.infer<typeof remedySchema>;

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
}

async function createCheerTicket(
  userId: string,
  challengeId: string,
  verificationId: string,
  delta: number
): Promise<void> {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const ticket = {
    ticketId: uuidv4(),
    userId,
    source: 'remedy',
    challengeId,
    verificationId,
    delta,
    status: 'available',
    usedAt: null,
    usedForCheerId: null,
    expiresAt: tomorrow.toISOString(),
    expiresAtTimestamp: Math.floor(tomorrow.getTime() / 1000),
    createdAt: now.toISOString()
  };

  await docClient.send(new PutCommand({
    TableName: process.env.USER_CHEER_TICKETS_TABLE!,
    Item: ticket
  }));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    const body = JSON.parse(event.body || '{}');
    const input: RemedyInput = remedySchema.parse(body);

    const userChallengeResult = await docClient.send(new GetCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId: input.userChallengeId }
    }));

    if (!userChallengeResult.Item) {
      return response(404, {
        error: 'USER_CHALLENGE_NOT_FOUND',
        message: '챌린지를 찾을 수 없습니다'
      });
    }

    const userChallenge = userChallengeResult.Item;

    if (userChallenge.userId !== userId) {
      return response(403, {
        error: 'FORBIDDEN',
        message: '본인의 챌린지만 보완할 수 있습니다'
      });
    }

    if (userChallenge.currentDay !== 6) {
      return response(400, {
        error: 'REMEDY_WRONG_DAY',
        message: 'Day 6에만 보완 인증이 가능합니다'
      });
    }

    const progress = userChallenge.progress || [];
    const failedDays = progress.filter((p: any) => p.status !== 'success' && p.day <= 5);
    if (failedDays.length === 0) {
      return response(400, {
        error: 'REMEDY_NO_FAILED_DAYS',
        message: '보완할 실패일이 없습니다'
      });
    }

    const defaultPolicy = { type: 'open', maxRemedyDays: null, allowBulk: null };
    const remedyPolicy = userChallenge.remedyPolicy || userChallenge.challenge?.defaultRemedyPolicy || defaultPolicy;

    if (remedyPolicy.type === 'strict') {
      return response(400, {
        error: 'REMEDY_NOT_ALLOWED',
        message: '이 챌린지는 보완이 허용되지 않습니다'
      });
    }

    const alreadyRemediedCount = progress.filter((p: any) => p.remedied === true).length;
    if (remedyPolicy.type === 'limited' && remedyPolicy.maxRemedyDays !== null) {
      if (alreadyRemediedCount >= remedyPolicy.maxRemedyDays) {
        return response(409, {
          error: 'REMEDY_MAX_REACHED',
          message: '최대 보완 횟수에 도달했습니다'
        });
      }
    }

    const originalDayProgress = progress.find((p: any) => p.day === input.originalDay);
    if (!originalDayProgress || originalDayProgress.status === 'success') {
      return response(400, {
        error: 'REMEDY_TARGET_INVALID',
        message: '복구 대상 day가 실제 실패일이 아닙니다'
      });
    }

    if (originalDayProgress.remedied) {
      return response(409, {
        error: 'REMEDY_TARGET_ALREADY_DONE',
        message: '이미 보완한 day입니다'
      });
    }

    const nowIso = new Date().toISOString();
    // practiceAt은 개인 기록용 - 미래 시간만 차단, 날짜 범위 제한 없음
    const performedAt = input.practiceAt || input.completedAt || nowIso;
    if (new Date(performedAt).getTime() > new Date(nowIso).getTime()) {
      return response(400, {
        error: 'FUTURE_PRACTICE_TIME',
        message: 'practiceAt이 uploadAt보다 미래입니다'
      });
    }
    const timezone = safeTimezone((event.headers?.['x-user-timezone'] || event.headers?.['X-User-Timezone']) as string | undefined || userChallenge.timezone);
    const certDate = certDateFromIso(nowIso, timezone); // REMEDY 업로드 날짜 기준

    const verificationId = uuidv4();
    const basePoints = Number(originalDayProgress.score || 10);
    const scoreEarned = remedyScore(basePoints);

    const verification = {
      verificationId,
      userId,
      userChallengeId: input.userChallengeId,
      challengeId: userChallenge.challengeId,
      day: 6,
      type: 'remedy',
      imageUrl: input.imageUrl || null,
      todayNote: input.todayNote,
      tomorrowPromise: input.tomorrowPromise || null,
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
      reflectionNote: input.reflectionNote,
      createdAt: nowIso
    };

    await docClient.send(new PutCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Item: verification
    }));

    const updatedProgress = [...progress];
    const originalIndex = updatedProgress.findIndex((p: any) => p.day === input.originalDay);

    if (originalIndex >= 0) {
      updatedProgress[originalIndex] = {
        day: input.originalDay,
        status: 'success',
        verificationId,
        timestamp: nowIso,
        delta: 0,
        score: scoreEarned,
        remedied: true
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
        ':updatedAt': nowIso
      }
    }));

    await createCheerTicket(
      userId,
      userChallenge.challengeId,
      verificationId,
      0
    );

    return response(200, {
      success: true,
      message: `Day ${input.originalDay} 보완 완료! 응원권 1장을 받았어요 🎟`,
      data: {
        verificationId,
        originalDay: input.originalDay,
        scoreEarned,
        totalScore,
        remainingRemedyDays: remedyPolicy.type === 'limited' && remedyPolicy.maxRemedyDays !== null ? Math.max(remedyPolicy.maxRemedyDays - (alreadyRemediedCount + 1), 0) : Math.max(failedDays.length - (alreadyRemediedCount + 1), 0),
        cheerTicketGranted: true,
        newBadges: []
      }
    });

  } catch (error: any) {
    console.error('Remedy verification error:', error);

    if (error instanceof z.ZodError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors
      });
    }

    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
