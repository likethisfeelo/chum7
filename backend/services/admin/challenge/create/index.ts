import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const MIN_PREPARING_GAP_MS = 60 * 1000;

/**
 * Challenge Lifecycle States:
 *   draft       → 관리자가 생성. 사용자에게 보이지 않음.
 *   recruiting  → 모집 중. 사용자가 참여 신청 가능.
 *   preparing   → 모집 마감. 챌린지 시작 전 준비 기간. 게시판(BulletinBoard) 활성화.
 *   active      → 챌린지 진행 중 (Day 1~7).
 *   completed   → 챌린지 종료. 결과 확정.
 *   archived    → 보관. 조회만 가능.
 *
 * Timeline:
 *   recruitingStartAt → recruitingEndAt → challengeStartAt → challengeEndAt
 *                       (preparing phase) ↑
 */
const createChallengeSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  category: z.enum(['health', 'habit', 'development', 'creativity', 'relationship', 'mindfulness', 'expand', 'impact']),
  targetTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),   // "HH:MM"
  identityKeyword: z.string().min(1).max(50),
  badgeIcon: z.string().min(1).max(10),
  badgeName: z.string().min(1).max(50),

  // Timeline (ISO datetime strings)
  recruitingStartAt: z.string().datetime(),    // 모집 시작
  recruitingEndAt: z.string().datetime(),      // 모집 마감
  challengeStartAt: z.string().datetime(),     // D-Day (챌린지 시작)

  // Config
  durationDays: z.number().int().min(1).max(30).default(7),
  maxParticipants: z.number().int().min(1).optional().nullable(), // null = 무제한
  challengeType: z.enum(['leader_only', 'personal_only', 'leader_personal', 'mixed']).default('leader_personal'),
  layerPolicy: z.object({
    requirePersonalGoalOnJoin: z.boolean().default(false),
    requirePersonalTargetOnJoin: z.boolean().default(true),
    allowExtraVisibilityToggle: z.boolean().default(true),
  }).default({}),
  defaultRemedyPolicy: z.object({
    // anytime: 언제든 지난 빈날 채우기 가능 (규칙 1)
    // last_day: 마지막 날(Day durationDays)에만 보완 가능, maxRemedyDays 설정 (규칙 2)
    // disabled: 보완 불가 (규칙 3)
    type: z.enum(['anytime', 'last_day', 'disabled']).default('anytime'),
    maxRemedyDays: z.number().int().min(1).max(30).nullable().default(null), // last_day 전용
  }).default({ type: 'anytime', maxRemedyDays: null }),
  personalQuestEnabled: z.boolean().default(false),
  personalQuestAutoApprove: z.boolean().default(false),
  requireStartConfirmation: z.boolean().default(false),
  joinApprovalRequired: z.boolean().default(true),
  allowedVerificationTypes: z.array(z.enum(['image', 'text', 'link', 'video'])).min(1).default(['image', 'text', 'link', 'video']),
});

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

function resolveLayerPolicy(challengeType: string, layerPolicy: { requirePersonalGoalOnJoin: boolean; requirePersonalTargetOnJoin: boolean; allowExtraVisibilityToggle: boolean; }) {
  const isMixed = challengeType === 'personal_only' || challengeType === 'leader_personal' || challengeType === 'mixed';

  return {
    requirePersonalGoalOnJoin: isMixed ? true : layerPolicy.requirePersonalGoalOnJoin,
    requirePersonalTargetOnJoin: layerPolicy.requirePersonalTargetOnJoin,
    allowExtraVisibilityToggle: layerPolicy.allowExtraVisibilityToggle,
  };
}

function resolvePersonalQuestEnabled(challengeType: string): boolean {
  if (challengeType === 'leader_only') return false;
  if (challengeType === 'personal_only' || challengeType === 'leader_personal' || challengeType === 'mixed') return true;
  return false;
}

function parseGroups(rawGroups: unknown): string[] {
  if (!rawGroups) return [];

  if (Array.isArray(rawGroups)) {
    return rawGroups.map(String).map(g => g.trim()).filter(Boolean);
  }

  if (typeof rawGroups !== 'string') {
    return [];
  }

  const value = rawGroups.trim();
  if (!value) return [];

  // Some authorizer payloads stringify arrays (e.g. '["admins"]')
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map(g => g.trim()).filter(Boolean);
      }
    } catch {
      // fall through to delimiter parsing
    }
  }

  return value
    .split(/[,:]/)
    .map(g => g.replace(/[\[\]"']/g, '').trim())
    .filter(Boolean);
}

function isAuthorized(event: APIGatewayProxyEvent): boolean {
  const groupsRaw = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  const groups = parseGroups(groupsRaw);
  const ALLOWED = new Set(['admins', 'leaders']);

  return groups.some(group => ALLOWED.has(group));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAuthorized(event)) {
      return response(403, { error: 'FORBIDDEN', message: '챌린지 생성 권한이 없습니다. admins 또는 leaders 그룹이어야 합니다' });
    }

    const body = JSON.parse(event.body || '{}');
    const input = createChallengeSchema.parse(body);

    // last_day 정책: maxRemedyDays는 durationDays - 1을 초과할 수 없음
    const rp = input.defaultRemedyPolicy;
    if (rp.type === 'last_day' && rp.maxRemedyDays !== null && rp.maxRemedyDays > input.durationDays - 1) {
      return response(400, {
        error: 'INVALID_MAX_REMEDY_DAYS',
        message: `최대 보완 횟수는 챌린지 기간 - 1(${input.durationDays - 1})을 초과할 수 없습니다`,
      });
    }

    // Timeline 순서 검증
    const recruitingStart = new Date(input.recruitingStartAt);
    const recruitingEnd = new Date(input.recruitingEndAt);
    const challengeStart = new Date(input.challengeStartAt);

    if (recruitingEnd <= recruitingStart) {
      return response(400, { error: 'INVALID_TIMELINE', message: '모집 마감일은 모집 시작일 이후여야 합니다' });
    }
    if (challengeStart.getTime() < recruitingEnd.getTime() + MIN_PREPARING_GAP_MS) {
      return response(400, {
        error: 'INVALID_TIMELINE',
        message: '챌린지 시작일은 모집 마감 시각으로부터 최소 1분 이후여야 합니다',
      });
    }

    // challengeEndAt = challengeStartAt + durationDays
    const challengeEnd = new Date(challengeStart);
    challengeEnd.setDate(challengeEnd.getDate() + input.durationDays);

    const challengeId = uuidv4();
    const now = new Date().toISOString();
    const adminUserId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    // 챌린지 유형별 정책 정규화
    const normalizedLayerPolicy = resolveLayerPolicy(input.challengeType, input.layerPolicy);

    // 현재 시각 기준 초기 lifecycle 결정
    const currentLifecycle = now >= input.recruitingStartAt ? 'recruiting' : 'draft';

    const challenge = {
      challengeId,
      title: input.title,
      description: input.description,
      category: input.category,
      targetTime: input.targetTime,
      identityKeyword: input.identityKeyword,
      badgeIcon: input.badgeIcon,
      badgeName: input.badgeName,

      // Lifecycle
      lifecycle: currentLifecycle,
      recruitingStartAt: input.recruitingStartAt,
      recruitingEndAt: input.recruitingEndAt,
      challengeStartAt: input.challengeStartAt,
      challengeEndAt: challengeEnd.toISOString(),
      endDate: challengeEnd.toISOString(), // category-index-v2 / lifecycle-index GSI sort key
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

      // Stats
      stats: {
        totalParticipants: 0,
        activeParticipants: 0,
        completionRate: 0,
        averageDelta: 0,
      },

      createdAt: now,
      updatedAt: now,
      createdBy: adminUserId,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Item: challenge,
    }));

    return response(201, {
      success: true,
      message: '챌린지가 생성되었습니다',
      data: challenge,
    });

  } catch (error: any) {
    console.error('Create challenge error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
