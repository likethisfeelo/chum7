import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const MIN_PREPARING_GAP_MS = 60 * 1000;

const createChallengeSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  category: z.enum(['health', 'habit', 'development', 'creativity', 'relationship', 'mindfulness', 'expand', 'impact']),
  targetTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
  identityKeyword: z.string().min(1).max(50),
  badgeIcon: z.string().min(1).max(10),
  badgeName: z.string().min(1).max(50),

  recruitingStartAt: z.string().datetime(),
  recruitingEndAt: z.string().datetime(),
  challengeStartAt: z.string().datetime(),

  durationDays: z.number().int().min(1).max(30).default(7),
  maxParticipants: z.number().int().min(1).optional().nullable(),
  challengeType: z.enum(['leader_only', 'personal_only', 'leader_personal', 'mixed']).default('leader_personal'),
  layerPolicy: z.object({
    requirePersonalGoalOnJoin: z.boolean().default(false),
    requirePersonalTargetOnJoin: z.boolean().default(true),
    allowExtraVisibilityToggle: z.boolean().default(true),
  }).default({}),
  defaultRemedyPolicy: z.object({
    type: z.enum(['anytime', 'last_day', 'disabled']).default('anytime'),
    maxRemedyDays: z.number().int().min(1).max(30).nullable().default(null),
  }).default({ type: 'anytime', maxRemedyDays: null }),
  personalQuestEnabled: z.boolean().default(false),
  personalQuestAutoApprove: z.boolean().default(false),
  requireStartConfirmation: z.boolean().default(false),
  joinApprovalRequired: z.boolean().default(false),
  allowedVerificationTypes: z.array(z.enum(['image', 'text', 'link', 'video'])).min(1).default(['image', 'text', 'link', 'video']),

  // 생성자 참여 여부
  participateAsCreator: z.boolean().default(false),
});

function apiResponse(statusCode: number, body: any): APIGatewayProxyResult {
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

function resolveLayerPolicy(
  challengeType: string,
  layerPolicy: { requirePersonalGoalOnJoin: boolean; requirePersonalTargetOnJoin: boolean; allowExtraVisibilityToggle: boolean },
) {
  const isMixed = challengeType === 'personal_only' || challengeType === 'leader_personal' || challengeType === 'mixed';
  return {
    requirePersonalGoalOnJoin: isMixed ? true : layerPolicy.requirePersonalGoalOnJoin,
    requirePersonalTargetOnJoin: layerPolicy.requirePersonalTargetOnJoin,
    allowExtraVisibilityToggle: layerPolicy.allowExtraVisibilityToggle,
  };
}

function resolvePersonalQuestEnabled(challengeType: string): boolean {
  if (challengeType === 'leader_only') return false;
  return true;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return apiResponse(401, { error: 'UNAUTHORIZED' });

    const body = JSON.parse(event.body || '{}');
    const input = createChallengeSchema.parse(body);

    // last_day 정책: maxRemedyDays는 durationDays - 1을 초과할 수 없음
    const rp = input.defaultRemedyPolicy;
    if (rp.type === 'last_day' && rp.maxRemedyDays !== null && rp.maxRemedyDays > input.durationDays - 1) {
      return apiResponse(400, {
        error: 'INVALID_MAX_REMEDY_DAYS',
        message: `최대 보완 횟수는 챌린지 기간 - 1(${input.durationDays - 1})을 초과할 수 없습니다`,
      });
    }

    // Timeline 순서 검증
    const recruitingStart = new Date(input.recruitingStartAt);
    const recruitingEnd = new Date(input.recruitingEndAt);
    const challengeStart = new Date(input.challengeStartAt);

    if (recruitingEnd <= recruitingStart) {
      return apiResponse(400, { error: 'INVALID_TIMELINE', message: '모집 마감일은 모집 시작일 이후여야 합니다' });
    }
    if (challengeStart.getTime() < recruitingEnd.getTime() + MIN_PREPARING_GAP_MS) {
      return apiResponse(400, {
        error: 'INVALID_TIMELINE',
        message: '챌린지 시작일은 모집 마감 시각으로부터 최소 1분 이후여야 합니다',
      });
    }

    const challengeEnd = new Date(challengeStart);
    challengeEnd.setDate(challengeEnd.getDate() + input.durationDays);

    const challengeId = uuidv4();
    const now = new Date().toISOString();

    const normalizedLayerPolicy = resolveLayerPolicy(input.challengeType, input.layerPolicy);

    const initialStats = input.participateAsCreator
      ? { totalParticipants: 1, activeParticipants: 1, completionRate: 0, averageDelta: 0, pendingParticipants: 0, completionCount: 0 }
      : { totalParticipants: 0, activeParticipants: 0, completionRate: 0, averageDelta: 0, pendingParticipants: 0, completionCount: 0 };

    const challenge = {
      challengeId,
      title: input.title,
      description: input.description,
      category: input.category,
      targetTime: input.targetTime,
      identityKeyword: input.identityKeyword,
      badgeIcon: input.badgeIcon,
      badgeName: input.badgeName,

      // 항상 draft로 시작 — 생성자가 수동으로 공개
      lifecycle: 'draft',
      recruitingStartAt: input.recruitingStartAt,
      recruitingEndAt: input.recruitingEndAt,
      challengeStartAt: input.challengeStartAt,
      challengeEndAt: challengeEnd.toISOString(),
      endDate: challengeEnd.toISOString(),
      durationDays: input.durationDays,
      maxParticipants: input.maxParticipants ?? null,
      challengeType: input.challengeType,
      layerPolicy: normalizedLayerPolicy,
      defaultRemedyPolicy: {
        type: input.defaultRemedyPolicy.type,
        maxRemedyDays: input.defaultRemedyPolicy.type === 'last_day' ? input.defaultRemedyPolicy.maxRemedyDays : null,
      },
      personalQuestEnabled: resolvePersonalQuestEnabled(input.challengeType),
      personalQuestAutoApprove: input.personalQuestAutoApprove,
      requireStartConfirmation: input.requireStartConfirmation,
      joinApprovalRequired: input.joinApprovalRequired,
      allowedVerificationTypes: input.allowedVerificationTypes,
      stats: initialStats,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Item: challenge,
    }));

    // 생성자가 참여자로도 등록될 경우 userChallenge 레코드 생성
    if (input.participateAsCreator) {
      const userChallengeId = uuidv4();
      await docClient.send(new PutCommand({
        TableName: process.env.USER_CHALLENGES_TABLE!,
        Item: {
          userChallengeId,
          userId,
          challengeId,
          groupId: challengeId,
          phase: 'preparing',
          status: 'active',
          joinStatus: 'approved',
          paymentStatus: 'free',
          score: 0,
          cheerScore: 0,
          thankScore: 0,
          deltaSum: 0,
          cheerCount: 0,
          consecutiveDays: 0,
          createdAt: now,
          updatedAt: now,
        },
      }));
    }

    return apiResponse(201, {
      success: true,
      message: '챌린지가 생성됐어요. 준비가 되면 모집을 시작해보세요!',
      data: challenge,
    });

  } catch (error: any) {
    console.error('[challenge/create] error:', error);
    if (error?.constructor?.name === 'ZodError') {
      return apiResponse(400, { error: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다', details: error.errors });
    }
    return apiResponse(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
