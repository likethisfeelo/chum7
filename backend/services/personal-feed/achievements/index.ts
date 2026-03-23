import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

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

async function queryAll<T>(params: Parameters<typeof docClient.send>[0]): Promise<T[]> {
  const results: T[] = [];
  let lastKey: Record<string, unknown> | undefined;
  const baseParams = (params as any).input;

  do {
    const res = await docClient.send(new QueryCommand({
      ...baseParams,
      ExclusiveStartKey: lastKey,
    }));
    results.push(...((res.Items ?? []) as T[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return results;
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

    // 병렬로 데이터 수집
    const [userChallengesItems, verificationsItems, sentCheers, receivedCheers, badgesItems] = await Promise.all([
      // 참여한 챌린지 목록
      docClient.send(new QueryCommand({
        TableName: process.env.USER_CHALLENGES_TABLE!,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': targetUserId },
        ProjectionExpression: 'userChallengeId, #s, bucketState',
        ExpressionAttributeNames: { '#s': 'status' },
      })).then((r) => (r.Items ?? []) as Record<string, unknown>[]),

      // 인증 기록
      docClient.send(new QueryCommand({
        TableName: process.env.VERIFICATIONS_TABLE!,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': targetUserId },
        ProjectionExpression: 'verificationId, score',
      })).then((r) => (r.Items ?? []) as Record<string, unknown>[]),

      // 보낸 응원
      docClient.send(new QueryCommand({
        TableName: process.env.CHEERS_TABLE!,
        IndexName: 'senderId-index',
        KeyConditionExpression: 'senderId = :senderId',
        ExpressionAttributeValues: { ':senderId': targetUserId },
        ProjectionExpression: 'cheerId',
        Limit: 1000,
      })).then((r) => (r.Items ?? []) as Record<string, unknown>[]),

      // 받은 응원
      docClient.send(new QueryCommand({
        TableName: process.env.CHEERS_TABLE!,
        IndexName: 'receiverId-index',
        KeyConditionExpression: 'receiverId = :receiverId',
        ExpressionAttributeValues: { ':receiverId': targetUserId },
        ProjectionExpression: 'cheerId',
        Limit: 1000,
      })).then((r) => (r.Items ?? []) as Record<string, unknown>[]),

      // 뱃지
      docClient.send(new QueryCommand({
        TableName: process.env.BADGES_TABLE!,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': targetUserId },
        ScanIndexForward: false,
      })).then((r) => (r.Items ?? []) as Record<string, unknown>[]),
    ]);

    // 챌린지 통계 집계
    const completedChallenges = userChallengesItems.filter((uc) => {
      const bucket = (uc.bucketState as string) || (uc.status as string) || '';
      return bucket === 'completed';
    });
    const activeChallenges = userChallengesItems.filter((uc) => {
      const bucket = (uc.bucketState as string) || (uc.status as string) || '';
      return bucket === 'active';
    });

    // 인증 스코어 집계
    const totalScore = verificationsItems.reduce((sum, v) => {
      return sum + (typeof v.score === 'number' ? v.score : 0);
    }, 0);

    // 뱃지 포맷
    const badges = badgesItems.map((b) => ({
      badgeId: b.badgeId as string,
      grantedAt: (b.grantedAt as string) ?? '',
      challengeId: (b.challengeId as string) ?? null,
    }));

    console.info('[personal-feed/achievements] success', {
      targetUserId,
      challenges: userChallengesItems.length,
      verifications: verificationsItems.length,
      badges: badges.length,
    });

    return response(200, {
      success: true,
      data: {
        challenges: {
          total: userChallengesItems.length,
          completed: completedChallenges.length,
          active: activeChallenges.length,
        },
        verifications: {
          total: verificationsItems.length,
          totalScore,
        },
        cheers: {
          sentCount: sentCheers.length,
          receivedCount: receivedCheers.length,
        },
        badges,
      },
    });
  } catch (error) {
    console.error('[personal-feed/achievements] error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
