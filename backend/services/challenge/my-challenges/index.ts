// backend/services/challenge/my-challenges/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { calculateEffectiveCurrentDay, isCompletedProgressStatus, resolveDurationDays } from '../../../shared/lib/challenge-day-sync';
import { normalizeProgress } from '../../../shared/lib/progress';
import { matchesRequestedChallengeStatus, resolveNormalizedChallengeState } from '../../../shared/lib/challenge-state';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function isDebugEnabled(params: Record<string, string | undefined>): boolean {
  const raw = String(params.debug || '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

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
    const debugEnabled = isDebugEnabled(params);

    // 1. 사용자의 챌린지 조회
    const userChallengesResult = await docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
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
    const challengeIds = [...new Set(userChallenges.map((uc: any) => uc.challengeId))];
    const challengesResult = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [process.env.CHALLENGES_TABLE!]: {
          Keys: challengeIds.map(id => ({ challengeId: id }))
        }
      }
    }));

    const challenges = challengesResult.Responses?.[process.env.CHALLENGES_TABLE!] || [];
    const challengeMap = new Map(challenges.map((c: any) => [c.challengeId, c]));

    // 3. 데이터 결합
    const nowIso = new Date().toISOString();
    const enrichedChallenges = userChallenges.map((uc: any) => {
      const challenge = challengeMap.get(uc.challengeId) as any;
      const durationDays = resolveDurationDays(challenge?.durationDays, uc.progress);

      // 진행률 계산
      const progressList = normalizeProgress(uc.progress);
      const completedDays = progressList.filter((p: any) => isCompletedProgressStatus(p?.status)).length;
      const progressPercentage = Math.max(0, Math.min(100, Math.round((completedDays / durationDays) * 100)));

      const effectiveCurrentDay = calculateEffectiveCurrentDay({
        ...uc,
        challengeStartAt: challenge?.challengeStartAt,
      }, nowIso, durationDays);

      // lifecycle-manager 크론 실행 지연 보정:
      // 자동 시작 챌린지(requireStartConfirmation=false)의 challengeStartAt이 이미 지났다면
      // lifecycle이 아직 'preparing'이더라도 'active'로 간주한다.
      const storedLifecycle = challenge?.lifecycle;
      const effectiveLifecycle = (
        storedLifecycle === 'preparing' &&
        !challenge?.requireStartConfirmation &&
        challenge?.challengeStartAt &&
        challenge.challengeStartAt <= nowIso
      ) ? 'active' : storedLifecycle;

      const { status: normalizedStatus, phase: normalizedPhase } = resolveNormalizedChallengeState({
        status: uc.status,
        phase: uc.phase,
        challengeLifecycle: effectiveLifecycle,
        effectiveCurrentDay,
        durationDays,
        completedDays,
      });

      const debugLifecycle = {
        storedCurrentDay: Number(uc.currentDay || 1),
        effectiveCurrentDay,
        durationDays,
        completedDays,
        progressLength: progressList.length,
        normalizedStatus,
        normalizedPhase,
        rawStatus: uc.status,
        rawPhase: uc.phase,
        challengeLifecycle: effectiveLifecycle || null,
        storedLifecycle: storedLifecycle || null,
        startDate: uc.startDate || null,
      };

      return {
        userChallengeId: uc.userChallengeId,
        challengeId: uc.challengeId,
        phase: normalizedPhase,
        status: normalizedStatus,
        currentDay: effectiveCurrentDay,
        startDate: uc.startDate,
        durationDays,
        score: uc.score,
        cheerCount: uc.cheerCount,
        consecutiveDays: uc.consecutiveDays,
        personalGoal: uc.personalGoal ?? null,
        personalTarget: uc.personalTarget ?? null,
        remedyPolicy: uc.remedyPolicy ?? null,
        usedRemedyCount: progressList.filter((p: any) => p?.remedied === true).length,
        progress: progressList,
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
          challengeType: challenge.challengeType,
          personalQuestEnabled: challenge.personalQuestEnabled,
          personalQuestAutoApprove: challenge.personalQuestAutoApprove,
          remedyPolicy: challenge.defaultRemedyPolicy || null,
          lifecycle: effectiveLifecycle,
          requireStartConfirmation: challenge.requireStartConfirmation ?? false,
          challengeStartAt: challenge.challengeStartAt,
          actualStartAt: challenge.actualStartAt || null,
          startConfirmedAt: challenge.startConfirmedAt || null,
          recruitingEndAt: challenge.recruitingEndAt,
          allowedVerificationTypes: Array.isArray(challenge.allowedVerificationTypes) && challenge.allowedVerificationTypes.length > 0
            ? challenge.allowedVerificationTypes
            : ['image', 'text', 'link', 'video'],
          durationDays,
        } : null,
        ...(debugEnabled ? { _debug: debugLifecycle } : {}),
      };
    });

    const filteredChallenges = enrichedChallenges.filter((c: any) => matchesRequestedChallengeStatus(status, c.status));

    return response(200, {
      success: true,
      data: {
        challenges: filteredChallenges,
        total: filteredChallenges.length,
        summary: {
          active: filteredChallenges.filter((c: any) => c.status === 'active').length,
          completed: filteredChallenges.filter((c: any) => c.status === 'completed').length,
          failed: filteredChallenges.filter((c: any) => c.status === 'failed').length
        },
        ...(debugEnabled ? {
          _debug: {
            nowIso,
            requestedStatus: status,
            totalRawUserChallenges: userChallenges.length,
            totalResolvedChallenges: enrichedChallenges.length,
            totalReturnedChallenges: filteredChallenges.length,
          }
        } : {})
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
