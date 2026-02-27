// backend/services/challenge/my-challenges/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    const params = event.queryStringParameters || {};
    const status = params.status || 'active'; // 'active', 'completed', 'failed'

    // 1. 사용자의 챌린지 조회
    const userChallengesResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: status !== 'all' ? '#status = :status' : undefined,
      ExpressionAttributeNames: status !== 'all' ? { '#status': 'status' } : undefined,
      ExpressionAttributeValues: {
        ':userId': userId,
        ...(status !== 'all' && { ':status': status })
      },
      ScanIndexForward: false // 최신순
    }));

    const userChallenges = userChallengesResult.Items || [];

    if (userChallenges.length === 0) {
      return response(200, {
        success: true,
        data: {
          challenges: [],
          total: 0
        }
      });
    }

    // 2. 챌린지 상세 정보 가져오기 (Batch Get)
    const challengeIds = [...new Set(userChallenges.map(uc => uc.challengeId))];
    const challengesResult = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [process.env.CHALLENGES_TABLE!]: {
          Keys: challengeIds.map(id => ({ challengeId: id }))
        }
      }
    }));

    const challenges = challengesResult.Responses?.[process.env.CHALLENGES_TABLE!] || [];
    const challengeMap = new Map(challenges.map(c => [c.challengeId, c]));

    // 3. 데이터 결합
    const enrichedChallenges = userChallenges.map(uc => {
      const challenge = challengeMap.get(uc.challengeId);
      
      // 진행률 계산
      const completedDays = uc.progress.filter((p: any) => p.status === 'success').length;
      const progressPercentage = Math.round((completedDays / 7) * 100);

      return {
        userChallengeId: uc.userChallengeId,
        challengeId: uc.challengeId,
        phase: uc.phase,
        status: uc.status,
        currentDay: uc.currentDay,
        startDate: uc.startDate,
        score: uc.score,
        cheerCount: uc.cheerCount,
        consecutiveDays: uc.consecutiveDays,
        progress: uc.progress,
        progressPercentage,
        completedDays,
        challenge: challenge ? {
          challengeId: challenge.challengeId,
          title: challenge.title,
          description: challenge.description,
          category: challenge.category,
          targetTime: challenge.targetTime,
          badgeIcon: challenge.badgeIcon,
          badgeName: challenge.badgeName,
          lifecycle: challenge.lifecycle,
          challengeStartAt: challenge.challengeStartAt,
          recruitingEndAt: challenge.recruitingEndAt,
        } : null
      };
    });

    return response(200, {
      success: true,
      data: {
        challenges: enrichedChallenges,
        total: enrichedChallenges.length,
        summary: {
          active: enrichedChallenges.filter(c => c.status === 'active').length,
          completed: enrichedChallenges.filter(c => c.status === 'completed').length,
          failed: enrichedChallenges.filter(c => c.status === 'failed').length
        }
      }
    });

  } catch (error: any) {
    console.error('Get my challenges error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
