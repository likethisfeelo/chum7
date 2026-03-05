import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

function isRecommendableLifecycle(lifecycle: string): boolean {
  return ['recruiting', 'active', 'preparing'].includes(lifecycle);
}

function rankChallenge(challenge: any): number {
  const recruitingBoost = challenge.lifecycle === 'recruiting' ? 1000 : 0;
  const completion = Number(challenge.stats?.completionRate || 0) * 100;
  const participants = Number(challenge.stats?.totalParticipants || 0);
  return recruitingBoost + completion + participants * 0.1;
}

function buildSuppressedChallengeSet(items: any[]): Set<string> {
  const nowMs = Date.now();
  const set = new Set<string>();

  for (const item of items) {
    if (!item?.isDismissed) continue;
    const challengeId = item.recommendedChallengeId;
    if (!challengeId) continue;

    const until = item.suppressUntil ? new Date(item.suppressUntil).getTime() : 0;
    if (until > nowMs) {
      set.add(challengeId);
    }
  }

  return set;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!userId) return response(401, { message: 'UNAUTHORIZED' });

    const verificationId = event.queryStringParameters?.verificationId;
    const plazaPostId = event.queryStringParameters?.plazaPostId;
    const limit = Math.max(1, Math.min(10, Number(event.queryStringParameters?.limit || '3')));
    if (!verificationId && !plazaPostId) {
      return response(400, { message: 'verificationId or plazaPostId required' });
    }

    const postsTable = process.env.PLAZA_POSTS_TABLE!;
    const verificationsTable = process.env.VERIFICATIONS_TABLE!;
    const challengesTable = process.env.CHALLENGES_TABLE!;
    const userChallengesTable = process.env.USER_CHALLENGES_TABLE!;
    const plazaRecommendationsTable = process.env.PLAZA_RECOMMENDATIONS_TABLE!;

    let sourceChallengeId: string | null = null;

    if (plazaPostId) {
      const postRes = await ddb.send(new GetCommand({
        TableName: postsTable,
        Key: { plazaPostId },
      }));
      sourceChallengeId = postRes.Item?.sourceChallengeId || null;
    }

    if (!sourceChallengeId && verificationId) {
      const verificationRes = await ddb.send(new GetCommand({
        TableName: verificationsTable,
        Key: { verificationId },
      }));
      sourceChallengeId = verificationRes.Item?.challengeId || null;
    }

    const userChallengesRes = await ddb.send(new QueryCommand({
      TableName: userChallengesTable,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }));
    const joined = new Set((userChallengesRes.Items || []).map((x: any) => x.challengeId).filter(Boolean));

    const dismissRes = await ddb.send(new QueryCommand({
      TableName: plazaRecommendationsTable,
      IndexName: 'userId-createdAt-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
      Limit: 100,
    }));
    const suppressed = buildSuppressedChallengeSet(dismissRes.Items || []);

    const challengeScan = await ddb.send(new ScanCommand({
      TableName: challengesTable,
      Limit: 100,
    }));
    const challenges = (challengeScan.Items || [])
      .filter((c: any) => c?.isVisible !== false && c?.isActive !== false)
      .filter((c: any) => !joined.has(c.challengeId))
      .filter((c: any) => !suppressed.has(c.challengeId));

    const sourceChallenge = challenges.find((c: any) => c.challengeId === sourceChallengeId);
    const category = sourceChallenge?.category;
    const leaderName = sourceChallenge?.leaderName || sourceChallenge?.ownerName;

    const recommendations: any[] = [];

    if (sourceChallenge && String(sourceChallenge.lifecycle) === 'recruiting') {
      recommendations.push({
        id: `${userId}#${sourceChallenge.challengeId}#source`,
        challengeId: sourceChallenge.challengeId,
        challengeTitle: sourceChallenge.title,
        completionRate: sourceChallenge.stats?.completionRate || 0,
        isRecruiting: true,
        reason: '방금 공감한 기록이 이 챌린지에서 나왔어요.',
      });
    }

    const leaderOthers = challenges
      .filter((c: any) => (c.leaderName || c.ownerName) === leaderName && c.challengeId !== sourceChallengeId)
      .filter((c: any) => isRecommendableLifecycle(String(c.lifecycle || '')))
      .sort((a: any, b: any) => rankChallenge(b) - rankChallenge(a))
      .slice(0, 3)
      .map((c: any) => ({
        id: `${userId}#${c.challengeId}#leader`,
        challengeId: c.challengeId,
        challengeTitle: c.title,
        completionRate: c.stats?.completionRate || 0,
        isRecruiting: c.lifecycle === 'recruiting',
        reason: '동일 리더가 진행/모집 중인 다른 챌린지예요.',
      }));
    recommendations.push(...leaderOthers);

    const sameCategory = challenges
      .filter((c: any) => c.category === category && c.challengeId !== sourceChallengeId)
      .filter((c: any) => isRecommendableLifecycle(String(c.lifecycle || '')))
      .sort((a: any, b: any) => rankChallenge(b) - rankChallenge(a))
      .slice(0, 5)
      .map((c: any) => ({
        id: `${userId}#${c.challengeId}#category`,
        challengeId: c.challengeId,
        challengeTitle: c.title,
        completionRate: c.stats?.completionRate || 0,
        isRecruiting: c.lifecycle === 'recruiting',
        reason: '같은 카테고리에서 완주율이 높은 챌린지예요.',
      }));
    recommendations.push(...sameCategory);

    const uniqueByChallenge = new Map<string, any>();
    for (const item of recommendations) {
      if (!item.challengeId) continue;
      if (!uniqueByChallenge.has(item.challengeId)) {
        uniqueByChallenge.set(item.challengeId, item);
      }
    }

    return response(200, {
      success: true,
      data: {
        recommendations: Array.from(uniqueByChallenge.values()).slice(0, limit),
      },
    });
  } catch (error: any) {
    console.error('Plaza recommend error:', error);
    return response(500, {
      message: 'INTERNAL_SERVER_ERROR',
      error: error?.message || 'unknown error',
    });
  }
};
