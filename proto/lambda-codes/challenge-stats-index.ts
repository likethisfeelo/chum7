// backend/services/challenge/stats/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

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
    const challengeId = event.pathParameters?.challengeId;

    if (!challengeId) {
      return response(400, {
        error: 'MISSING_CHALLENGE_ID',
        message: '챌린지 ID가 필요합니다'
      });
    }

    // 1. 챌린지 기본 정보
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

    // 2. 참여자 데이터 조회
    const participantsResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'challengeId-index',
      KeyConditionExpression: 'challengeId = :challengeId',
      ExpressionAttributeValues: {
        ':challengeId': challengeId
      }
    }));

    const participants = participantsResult.Items || [];

    // 3. 통계 계산
    const totalParticipants = participants.length;
    const activeParticipants = participants.filter(p => p.status === 'active').length;
    const completedParticipants = participants.filter(p => p.status === 'completed').length;
    const failedParticipants = participants.filter(p => p.status === 'failed').length;

    const completionRate = totalParticipants > 0 
      ? (completedParticipants / totalParticipants) * 100 
      : 0;

    // 평균 점수
    const totalScore = participants.reduce((sum, p) => sum + (p.score || 0), 0);
    const averageScore = totalParticipants > 0 ? totalScore / totalParticipants : 0;

    // Day별 완료율
    const dayCompletionRates = Array.from({ length: 7 }, (_, day) => {
      const dayNumber = day + 1;
      const completedForDay = participants.filter(p => {
        const dayProgress = p.progress?.find((pr: any) => pr.day === dayNumber);
        return dayProgress && dayProgress.status === 'success';
      }).length;
      
      return {
        day: dayNumber,
        completionRate: totalParticipants > 0 ? (completedForDay / totalParticipants) * 100 : 0,
        completedCount: completedForDay
      };
    });

    // 평균 델타
    const totalDelta = participants.reduce((sum, p) => sum + (p.deltaSum || 0), 0);
    const averageDelta = totalParticipants > 0 ? totalDelta / totalParticipants : 0;

    return response(200, {
      success: true,
      data: {
        challenge: {
          challengeId: challenge.challengeId,
          title: challenge.title,
          category: challenge.category
        },
        stats: {
          totalParticipants,
          activeParticipants,
          completedParticipants,
          failedParticipants,
          completionRate: Math.round(completionRate * 10) / 10,
          averageScore: Math.round(averageScore * 10) / 10,
          averageDelta: Math.round(averageDelta),
          dayCompletionRates
        }
      }
    });

  } catch (error: any) {
    console.error('Get challenge stats error:', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
