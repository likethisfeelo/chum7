// backend/services/challenge/join/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const joinSchema = z.object({
  startDate: z.string().optional(), // ISO date string
  personalGoal: z.string().max(200).optional()
});

type JoinInput = z.infer<typeof joinSchema>;

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

// 그룹 ID 생성 (같은 챌린지, 같은 시작일 = 같은 그룹)
function generateGroupId(challengeId: string, startDate: string): string {
  return `${challengeId}-${startDate}`;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub || event.queryStringParameters?.userId;
    const challengeId = event.pathParameters?.challengeId;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    if (!challengeId) {
      return response(400, {
        error: 'MISSING_CHALLENGE_ID',
        message: '챌린지 ID가 필요합니다'
      });
    }

    const body = JSON.parse(event.body || '{}');
    const input: JoinInput = joinSchema.parse(body);

    // 1. 챌린지 존재 확인
    const challengeResult = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId }
    }));

    if (!challengeResult.Item) {
      return response(404, {
        error: 'CHALLENGE_NOT_FOUND',
        message: '챌린지를 찾을 수 없습니다'
      });
    }

    const challenge = challengeResult.Item;

    // 2. 이미 참여 중인지 확인
    const existingResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'challengeId = :challengeId AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':challengeId': challengeId,
        ':status': 'active'
      }
    }));

    if (existingResult.Items && existingResult.Items.length > 0) {
      return response(409, {
        error: 'ALREADY_JOINED',
        message: '이미 참여 중인 챌린지입니다'
      });
    }

    // 3. 시작일 설정 (기본: 오늘)
    const startDate = input.startDate || new Date().toISOString().split('T')[0];
    const groupId = generateGroupId(challengeId, startDate);

    // 4. UserChallenge 생성
    const userChallengeId = uuidv4();
    const now = new Date().toISOString();

    const userChallenge = {
      userChallengeId,
      userId,
      challengeId,
      startDate,
      status: 'active',
      currentDay: 0,
      progress: Array.from({ length: 7 }, (_, i) => ({
        day: i + 1,
        status: null
      })),
      score: 0,
      deltaSum: 0,
      cheerCount: 0,
      groupId,
      personalGoal: input.personalGoal || null,
      consecutiveDays: 0,
      createdAt: now,
      updatedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      Item: userChallenge
    }));

    // 5. 챌린지 통계 업데이트 (참여자 수 +1)
    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: 'SET stats.totalParticipants = if_not_exists(stats.totalParticipants, :zero) + :inc, stats.activeParticipants = if_not_exists(stats.activeParticipants, :zero) + :inc',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':inc': 1
      }
    }));

    return response(201, {
      success: true,
      message: '챌린지 참여가 완료되었습니다',
      data: {
        userChallengeId,
        challenge: {
          challengeId: challenge.challengeId,
          title: challenge.title,
          category: challenge.category,
          targetTime: challenge.targetTime,
          badgeIcon: challenge.badgeIcon
        },
        startDate,
        groupId
      }
    });

  } catch (error: any) {
    console.error('Join challenge error:', error);

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