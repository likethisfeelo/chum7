import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
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

function resolveBucketState(status: string, phase: string): 'active' | 'completed' | 'gave_up' | 'preparing' {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'gave_up') return 'gave_up';
  if (phase === 'preparing' || status === 'pending') return 'preparing';
  return 'active';
}

function countCompletedDays(progress: unknown[]): number {
  if (!Array.isArray(progress)) return 0;
  const completedStatuses = new Set(['success', 'partial', 'completed', 'remedy']);
  return progress.filter((p: any) => completedStatuses.has(p?.status)).length;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!requesterId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const userIdParam = event.pathParameters?.userId;
    const targetUserId = userIdParam === 'me' ? requesterId : userIdParam;
    if (!targetUserId) {
      return response(400, { error: 'MISSING_USER_ID', message: 'userId가 필요합니다' });
    }

    // 1. user-challenges 조회
    const ucResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': targetUserId },
      ScanIndexForward: false,
    }));

    const userChallenges = (ucResult.Items ?? []) as Record<string, unknown>[];
    if (userChallenges.length === 0) {
      return response(200, { success: true, data: { challenges: [], total: 0 } });
    }

    // 2. challenges BatchGet
    const challengeIds = [...new Set(userChallenges.map((uc) => uc.challengeId as string).filter(Boolean))];
    const batchResult = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [process.env.CHALLENGES_TABLE!]: {
          Keys: challengeIds.map((id) => ({ challengeId: id })),
          ProjectionExpression: 'challengeId, title, category, badgeIcon, badgeName, durationDays, challengeStartAt, actualStartAt',
        },
      },
    }));

    const challengeMap = new Map(
      (batchResult.Responses?.[process.env.CHALLENGES_TABLE!] ?? []).map((c: any) => [c.challengeId, c])
    );

    // 3. 결합 & 집계
    const challenges = userChallenges.map((uc) => {
      const challenge = challengeMap.get(uc.challengeId as string) as Record<string, unknown> | undefined;
      const progress = (uc.progress as unknown[]) ?? [];
      const durationDays = (challenge?.durationDays as number) ?? (progress.length || 7);
      const completedDays = countCompletedDays(progress);
      const bucketState = resolveBucketState(uc.status as string, uc.phase as string);

      return {
        userChallengeId: uc.userChallengeId as string,
        challengeId: uc.challengeId as string,
        title: (challenge?.title as string) ?? '알 수 없는 챌린지',
        category: (challenge?.category as string) ?? null,
        badgeIcon: (challenge?.badgeIcon as string) ?? null,
        badgeName: (challenge?.badgeName as string) ?? null,
        durationDays,
        completedDays,
        score: typeof uc.score === 'number' ? uc.score : 0,
        bucketState,
        startDate: (uc.startDate as string) ?? null,
        challengeStartAt: (challenge?.challengeStartAt as string) ?? null,
        actualStartAt: (challenge?.actualStartAt as string) ?? null,
      };
    });

    // 완주 우선 정렬, 그 다음 최신순
    challenges.sort((a, b) => {
      if (a.bucketState === 'completed' && b.bucketState !== 'completed') return -1;
      if (a.bucketState !== 'completed' && b.bucketState === 'completed') return 1;
      return (b.startDate ?? '').localeCompare(a.startDate ?? '');
    });

    return response(200, {
      success: true,
      data: { challenges, total: challenges.length },
    });
  } catch (error) {
    console.error('[personal-feed/challenges] error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
