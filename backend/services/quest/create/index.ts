/**
 * POST /admin/quests
 * Admin이 퀘스트를 생성한다.
 *
 * Quest는 반드시 특정 챌린지에 연결되어 생성된다.
 * allowedVerificationTypes: 퀘스트에서 허용할 인증 방식 목록 (복수 가능)
 *   기본값: 챌린지의 allowedVerificationTypes 전체 상속
 *   제출 시 사용자가 허용 목록 안에서 방식을 선택함
 *
 * approvalRequired = true  → 제출 후 pending, 관리자 검토 필요
 * approvalRequired = false → 제출 즉시 auto_approved, 포인트 자동 지급
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const verificationConfigSchema = z.object({
  maxFileSizeMB: z.number().int().min(1).max(100).optional(),     // image/video
  maxDurationSeconds: z.number().int().min(1).max(60).optional(), // video (최대 1분)
  linkPattern: z.string().max(200).optional(),                    // link (regex)
  requireInAppBrowser: z.boolean().optional(),                    // link → 인앱 브라우저
  maxChars: z.number().int().min(1).max(2000).optional(),         // text
}).default({});

const remedyPolicySchema = z.object({
  type: z.enum(['strict', 'limited', 'open']).default('open'),
  maxRemedyDays: z.number().int().min(1).max(2).nullable().default(null),
  allowBulk: z.boolean().nullable().default(null),
}).default({ type: 'open', maxRemedyDays: null, allowBulk: null });

const createQuestSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  challengeId: z.string().uuid(),                                 // 챌린지별 퀘스트 필수
  allowedVerificationTypes: z.array(z.enum(['image', 'video', 'link', 'text'])).min(1).optional(),
  verificationGuide: z.string().min(1).max(500).optional(),       // 제출 방법 안내
  verificationConfig: verificationConfigSchema,
  rewardPoints: z.number().int().min(0).max(1000).default(10),
  rewardBadgeId: z.string().max(50).optional().nullable(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional().nullable(),             // null = 기간 무제한
  approvalRequired: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),              // 보드 내 표시 순서
  questLayer: z.enum(['A', 'B', 'D']).optional().default('A'),
  questScope: z.enum(['leader', 'personal', 'mixed']).optional().default('leader'),
  requireOnJoinInput: z.boolean().optional().default(false),
  remedyPolicy: remedyPolicySchema,
  startDay: z.number().int().min(1).max(7).nullable().optional().default(null),
  endDay: z.number().int().min(1).max(7).nullable().optional().default(null),
  revealAt: z.string().datetime().nullable().optional().default(null),
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
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

function canManageByGroup(event: APIGatewayProxyEvent): boolean {
  const groupsRaw = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  const groups = parseGroups(groupsRaw);
  const allowed = new Set(['admins', 'productowners', 'managers']);
  return groups.some(group => allowed.has(group));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const input = createQuestSchema.parse(body);

    // challengeId 존재 확인
    const challengeResult = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId: input.challengeId },
    }));
    if (!challengeResult.Item) {
      return response(404, { error: 'CHALLENGE_NOT_FOUND', message: '연결할 챌린지가 없습니다' });
    }
    const challenge = challengeResult.Item;

    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const isChallengeCreator = challenge?.createdBy && challenge.createdBy === requesterId;
    if (!canManageByGroup(event) && !isChallengeCreator) {
      return response(403, { error: 'FORBIDDEN', message: '퀘스트 생성 권한이 없습니다' });
    }

    const defaultAllowedTypes: Array<'image' | 'video' | 'link' | 'text'> = ['image', 'video', 'link', 'text'];
    const rawChallengeAllowed = challenge.allowedVerificationTypes as string[] | undefined;
    const challengeAllowedTypes = (rawChallengeAllowed?.length
      ? rawChallengeAllowed.filter((t) => defaultAllowedTypes.includes(t as any))
      : defaultAllowedTypes
    ) as Array<'image' | 'video' | 'link' | 'text'>;

    // 퀘스트 허용 방식: 입력값이 있으면 챌린지 허용 범위 내에서 필터, 없으면 챌린지 전체 상속
    const questAllowedTypes: Array<'image' | 'video' | 'link' | 'text'> = input.allowedVerificationTypes?.length
      ? input.allowedVerificationTypes.filter((t) => challengeAllowedTypes.includes(t))
      : challengeAllowedTypes;

    if (questAllowedTypes.length === 0) {
      return response(400, {
        error: 'VERIFICATION_TYPE_NOT_ALLOWED',
        message: `이 챌린지에서 허용되지 않는 인증 방식입니다. 허용: ${challengeAllowedTypes.join(', ')}`,
      });
    }

    const questId = uuidv4();
    const now = new Date().toISOString();
    const verificationGuide = input.verificationGuide?.trim() || input.description;

    const quest = {
      questId,
      title: input.title,
      description: input.description,
      challengeId: input.challengeId,
      allowedVerificationTypes: questAllowedTypes,
      verificationType: questAllowedTypes[0], // 하위호환 (기존 코드 대비)
      verificationGuide,
      verificationConfig: input.verificationConfig,
      rewardPoints: input.rewardPoints,
      rewardBadgeId: input.rewardBadgeId ?? null,
      startAt: input.startAt ?? now,
      endAt: input.endAt ?? null,
      approvalRequired: input.approvalRequired,
      displayOrder: input.displayOrder,
      questLayer: input.questLayer,
      questScope: input.questScope,
      requireOnJoinInput: input.requireOnJoinInput,
      remedyPolicy: input.remedyPolicy,
      startDay: input.startDay,
      endDay: input.endDay,
      revealAt: input.revealAt,
      status: 'active',
      submissionCount: 0,
      approvedCount: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: requesterId,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.QUESTS_TABLE!,
      Item: quest,
    }));

    return response(201, { success: true, message: '퀘스트가 생성되었습니다', data: quest });

  } catch (error: any) {
    console.error('Create quest error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
