// backend/services/verification/remedy/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const remedySchema = z.object({
  userChallengeId: z.string().uuid(),
  originalDay: z.number().min(1).max(5), // Day 1-5만 보완 가능
  imageUrl: z.string().url().optional(),
  reflectionNote: z.string().min(10).max(500), // 회고 (필수)
  todayNote: z.string().min(1).max(500),
  tomorrowPromise: z.string().max(500).optional(),
  completedAt: z.string().datetime()
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

// 응원권 생성
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
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub || event.queryStringParameters?.userId;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    const body = JSON.parse(event.body || '{}');
    const input: RemedyInput = remedySchema.parse(body);

    // 1. UserChallenge 조회
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

    // 2. 권한 확인
    if (userChallenge.userId !== userId) {
      return response(403, {
        error: 'FORBIDDEN',
        message: '본인의 챌린지만 보완할 수 있습니다'
      });
    }

    // 3. Day 6인지 확인
    if (userChallenge.currentDay !== 6) {
      return response(400, {
        error: 'NOT_DAY_6',
        message: 'Day 6에만 보완 인증이 가능합니다'
      });
    }

    // 4. 해당 Day가 실패 상태인지 확인
    const progress = userChallenge.progress || [];
    const originalDayProgress = progress.find((p: any) => p.day === input.originalDay);

    if (originalDayProgress && originalDayProgress.status === 'success') {
      return response(400, {
        error: 'DAY_ALREADY_COMPLETED',
        message: '이미 완료한 날은 보완할 수 없습니다'
      });
    }

    // 5. 이미 보완했는지 확인
    if (originalDayProgress && originalDayProgress.remedied) {
      return response(409, {
        error: 'ALREADY_REMEDIED',
        message: '이미 보완한 날입니다'
      });
    }

    // 6. 보완 인증 생성
    const verificationId = uuidv4();
    const now = new Date().toISOString();

    const verification = {
      verificationId,
      userId,
      userChallengeId: input.userChallengeId,
      challengeId: userChallenge.challengeId,
      day: 6, // Day 6에 제출
      type: 'remedy',
      imageUrl: input.imageUrl || null,
      todayNote: input.todayNote,
      tomorrowPromise: input.tomorrowPromise || null,
      completedAt: input.completedAt,
      targetTime: null, // 보완은 델타 없음
      delta: 0,
      score: 7, // 70% 점수
      cheerCount: 0,
      isPublic: 'false',
      isAnonymous: true,
      originalDay: input.originalDay,
      reflectionNote: input.reflectionNote,
      createdAt: now
    };

    await docClient.send(new PutCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Item: verification
    }));

    // 7. UserChallenge 업데이트
    const updatedProgress = [...progress];
    const originalIndex = updatedProgress.findIndex((p: any) => p.day === input.originalDay);

    if (originalIndex >= 0) {
      updatedProgress[originalIndex] = {
        day: input.originalDay,
        status: 'success',
        verificationId,
        timestamp: input.completedAt,
        delta: 0,
        score: 7,
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
        ':updatedAt': now
      }
    }));

    // 8. 보너스 응원권 생성
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
        scoreEarned: 7,
        totalScore,
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
