// backend/services/verification/submit/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// 입력 검증 스키마
const submitSchema = z.object({
  userChallengeId: z.string().uuid(),
  day: z.number().min(1).max(7),
  imageUrl: z.string().url().optional(),
  todayNote: z.string().min(1).max(500),
  tomorrowPromise: z.string().max(500).optional(),
  completedAt: z.string().datetime(),
  targetTime: z.string().datetime(),
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

// 델타 계산 (분 단위)
function calculateDelta(targetTime: string, completedAt: string): number {
  const target = new Date(targetTime).getTime();
  const completed = new Date(completedAt).getTime();
  const diffMs = target - completed;
  return Math.floor(diffMs / 60000); // 밀리초를 분으로 변환
}

// 응원권 생성
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
    source, // 'early_completion', 'streak_3', 'remedy', 'complete'
    challengeId,
    verificationId,
    delta,
    status: 'available',
    usedAt: null,
    usedForCheerId: null,
    expiresAt: tomorrow.toISOString(),
    expiresAtTimestamp: Math.floor(tomorrow.getTime() / 1000), // TTL용
    createdAt: now.toISOString()
  };

  await docClient.send(new PutCommand({
    TableName: process.env.USER_CHEER_TICKETS_TABLE!,
    Item: ticket
  }));
}

// 같은 그룹의 미완료자 확인
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

  // 현재 Day의 인증을 완료하지 않은 사용자 수 계산
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
    // 1. 입력 검증
    const body = JSON.parse(event.body || '{}');
    const input: SubmitInput = submitSchema.parse(body);

    // 2. 사용자 인증 정보 (실제로는 Cognito Authorizer에서 가져옴)
    // const userId = event.requestContext.authorizer?.jwt.claims.sub;
    const userId = body.userId; // 임시 (테스트용)

    // 3. UserChallenge 조회
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

    // 4. 이미 인증했는지 확인
    const progress = userChallenge.progress || [];
    const dayProgress = progress.find((p: any) => p.day === input.day);
    if (dayProgress && dayProgress.status === 'success') {
      return response(409, {
        error: 'ALREADY_VERIFIED',
        message: '이미 인증을 완료했습니다'
      });
    }

    // 5. 델타 계산
    const delta = calculateDelta(input.targetTime, input.completedAt);
    const isEarlyCompletion = delta > 0;

    // 6. 인증 데이터 생성
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
      completedAt: input.completedAt,
      targetTime: input.targetTime,
      delta, // 응원 시스템용
      score: 10, // 고정 점수
      cheerCount: 0,
      isPublic: input.isPublic ? 'true' : 'false', // GSI용 문자열
      isAnonymous: input.isAnonymous,
      originalDay: null,
      reflectionNote: null,
      createdAt: now
    };

    // 7. DynamoDB에 저장
    await docClient.send(new PutCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      Item: verification
    }));

    // 8. UserChallenge 업데이트
    const updatedProgress = [...progress];
    const existingIndex = updatedProgress.findIndex((p: any) => p.day === input.day);
    
    const newProgress = {
      day: input.day,
      status: 'success',
      verificationId,
      timestamp: input.completedAt,
      delta,
      score: 10
    };

    if (existingIndex >= 0) {
      updatedProgress[existingIndex] = newProgress;
    } else {
      updatedProgress.push(newProgress);
    }

    // 연속 일수 계산
    let consecutiveDays = 0;
    for (let i = 1; i <= input.day; i++) {
      const p = updatedProgress.find((p: any) => p.day === i);
      if (p && p.status === 'success') {
        consecutiveDays++;
      } else {
        break;
      }
    }

    // 총 점수 계산
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

    // 9. 스마트 응원 로직 ⭐ 핵심!
    let cheerOpportunity = {
      hasIncompletePeople: false,
      incompleteCount: 0,
      canCheerNow: false,
      cheerTicketGranted: false
    };

    if (isEarlyCompletion) {
      // 같은 그룹의 미완료자 확인
      const incompleteCheck = await checkIncompleteUsers(
        userChallenge.groupId,
        input.day
      );

      cheerOpportunity = {
        ...incompleteCheck,
        canCheerNow: incompleteCheck.hasIncompletePeople,
        cheerTicketGranted: !incompleteCheck.hasIncompletePeople
      };

      // 미완료자가 없으면 응원권 생성
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

    // 10. 보너스 응원권 체크
    const newBadges: string[] = [];

    // 3일 연속 성공 → 응원권 1장
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

    // Day 7 완주 → 응원권 3장
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

    // 11. 응답
    const message = isEarlyCompletion
      ? `Day ${input.day} 완료! 목표보다 ${delta}분 일찍!`
      : `Day ${input.day} 완료!`;

    return response(200, {
      success: true,
      message,
      data: {
        verificationId,
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
