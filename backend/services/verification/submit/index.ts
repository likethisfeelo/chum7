// backend/services/verification/submit/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const submitSchema = z.object({
  userChallengeId: z.string().uuid(),
  day: z.number().min(1).max(7),
  imageUrl: z.string().url().optional(),
  todayNote: z.string().min(1).max(500),
  tomorrowPromise: z.string().max(500).optional(),
  verificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  performedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(), // backward compatibility
  targetTime: z.string().datetime().optional(),
  isPublic: z.boolean().default(true),
  isAnonymous: z.boolean().default(true)
});

type SubmitInput = z.infer<typeof submitSchema>;

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

function calculateDelta(targetTime: string, completedAt: string): number {
  const target = new Date(targetTime).getTime();
  const completed = new Date(completedAt).getTime();
  const diffMs = target - completed;
  return Math.floor(diffMs / 60000);
}

function buildTargetDateTimeISO(verificationDate: string, time24: string, timezone: string): string {
  const [hh, mm] = time24.split(':').map(Number);
  const [y, m, d] = verificationDate.split('-').map(Number);

  if (timezone === 'Asia/Seoul') {
    const utcMs = Date.UTC(y, m - 1, d, hh - 9, mm, 0, 0);
    return new Date(utcMs).toISOString();
  }

  // fallback: timezone 고도화 전까지 UTC 취급
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0)).toISOString();
}

async function createCheerTicket(
  userId: string,
  challengeId: string,
  verificationId: string,
  delta: number,
  source: string
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

async function checkIncompleteUsers(
  groupId: string,
  currentDay: number
): Promise<{ hasIncompletePeople: boolean; incompleteCount: number }> {
  const result = await docClient.send(new QueryCommand({
    TableName: process.env.USER_CHALLENGES_TABLE!,
    IndexName: 'groupId-index',
    KeyConditionExpression: 'groupId = :groupId',
    ExpressionAttributeValues: {
      ':groupId': groupId
    }
  }));

  if (!result.Items) {
    return { hasIncompletePeople: false, incompleteCount: 0 };
  }

  const incompleteUsers = result.Items.filter(uc => {
    const progress = uc.progress || [];
    const todayProgress = progress.find((p: any) => p.day === currentDay);
    return !todayProgress || todayProgress.status !== 'success';
  });

  return {
    hasIncompletePeople: incompleteUsers.length > 0,
    incompleteCount: incompleteUsers.length
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const input: SubmitInput = submitSchema.parse(body);

    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

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

    const progress = userChallenge.progress || [];
    const dayProgress = progress.find((p: any) => p.day === input.day);
    if (dayProgress && dayProgress.status === 'success') {
      return response(409, {
        error: 'ALREADY_VERIFIED',
        message: '이미 인증을 완료했습니다'
      });
    }

    const performedAt = input.performedAt || input.completedAt || new Date().toISOString();
    const verificationDate = input.verificationDate || performedAt.slice(0, 10);

    const personalTarget = userChallenge.personalTarget;
    const derivedTargetTime = personalTarget?.time24
      ? buildTargetDateTimeISO(verificationDate, personalTarget.time24, personalTarget.timezone || 'Asia/Seoul')
      : undefined;
    const effectiveTargetTime = input.targetTime || derivedTargetTime;

    if (!effectiveTargetTime) {
      return response(400, {
        error: 'MISSING_TARGET_TIME',
        message: '개인 목표시간 설정 또는 targetTime 입력이 필요합니다'
      });
    }

    const delta = calculateDelta(effectiveTargetTime, performedAt);
    const isEarlyCompletion = delta > 0;

    const verificationId = uuidv4();
    const now = new Date().toISOString();

    const verification = {
      verificationId,
      userId,
      userChallengeId: input.userChallengeId,
      challengeId: userChallenge.challengeId,
      day: input.day,
      type: 'normal',
      imageUrl: input.imageUrl || null,
      todayNote: input.todayNote,
      tomorrowPromise: input.tomorrowPromise || null,
      verificationDate,
      performedAt,
      uploadedAt: now,
      completedAt: performedAt,
      targetTime: effectiveTargetTime,
      delta,
      score: 10,
      cheerCount: 0,
      isPublic: input.isPublic ? 'true' : 'false',
      isAnonymous: input.isAnonymous,
      originalDay: null,
      reflectionNote: null,
      createdAt: now
    };

    await docClient.send(new PutCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Item: verification
    }));

    const updatedProgress = [...progress];
    const existingIndex = updatedProgress.findIndex((p: any) => p.day === input.day);

    const newProgress = {
      day: input.day,
      status: 'success',
      verificationId,
      timestamp: performedAt,
      delta,
      score: 10
    };

    if (existingIndex >= 0) {
      updatedProgress[existingIndex] = newProgress;
    } else {
      updatedProgress.push(newProgress);
    }

    let consecutiveDays = 0;
    for (let i = 1; i <= input.day; i++) {
      const p = updatedProgress.find((p: any) => p.day === i);
      if (p && p.status === 'success') {
        consecutiveDays++;
      } else {
        break;
      }
    }

    const totalScore = updatedProgress
      .filter((p: any) => p.status === 'success')
      .reduce((sum: number, p: any) => sum + (p.score || 0), 0);

    await docClient.send(new UpdateCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Key: { userChallengeId: input.userChallengeId },
      UpdateExpression: 'SET progress = :progress, currentDay = :currentDay, score = :score, consecutiveDays = :consecutiveDays, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':progress': updatedProgress,
        ':currentDay': input.day,
        ':score': totalScore,
        ':consecutiveDays': consecutiveDays,
        ':updatedAt': now
      }
    }));

    let cheerOpportunity = {
      hasIncompletePeople: false,
      incompleteCount: 0,
      canCheerNow: false,
      cheerTicketGranted: false
    };

    if (isEarlyCompletion) {
      const incompleteCheck = await checkIncompleteUsers(
        userChallenge.groupId,
        input.day
      );

      cheerOpportunity = {
        ...incompleteCheck,
        canCheerNow: incompleteCheck.hasIncompletePeople,
        cheerTicketGranted: !incompleteCheck.hasIncompletePeople
      };

      if (!incompleteCheck.hasIncompletePeople) {
        await createCheerTicket(
          userId,
          userChallenge.challengeId,
          verificationId,
          delta,
          'early_completion'
        );
      }
    }

    const newBadges: string[] = [];

    if (consecutiveDays === 3) {
      await createCheerTicket(
        userId,
        userChallenge.challengeId,
        verificationId,
        delta,
        'streak_3'
      );
      cheerOpportunity.cheerTicketGranted = true;
      newBadges.push('3-day-streak');
    }

    if (input.day === 7 && consecutiveDays === 7) {
      for (let i = 0; i < 3; i++) {
        await createCheerTicket(
          userId,
          userChallenge.challengeId,
          verificationId,
          delta,
          'complete'
        );
      }
      cheerOpportunity.cheerTicketGranted = true;
      newBadges.push('7-day-master');
    }

    const message = isEarlyCompletion
      ? `Day ${input.day} 완료! 목표보다 ${delta}분 일찍!`
      : `Day ${input.day} 완료!`;

    return response(200, {
      success: true,
      message,
      data: {
        verificationId,
        verificationDate,
        performedAt,
        uploadedAt: now,
        day: input.day,
        delta,
        isEarlyCompletion,
        scoreEarned: 10,
        totalScore,
        consecutiveDays,
        cheerOpportunity,
        newBadges
      }
    });

  } catch (error: any) {
    console.error('Verification submit error:', error);

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
