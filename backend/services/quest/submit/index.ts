/**
 * POST /quests/{questId}/submit
 *
 * 2-테이블 패턴:
 *   ① activeQuestSubmissions  : PK = `${userId}#${questId}`
 *      - ConditionalWrite (attribute_not_exists) → 중복 원자적 방지
 *      - 이 레코드가 존재하면 이미 pending/approved 상태
 *      - rejected 시 DELETE됨 → 재제출 가능
 *
 *   ② questSubmissions (이력) : PK = submissionId (UUID)
 *      - 모든 시도를 append-only로 보관
 *      - previousSubmissionId → 재제출 체인 추적
 *      - attemptNumber        → 몇 번째 시도인지
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { normalizeQuestSubmissionContent, validateQuestSubmissionContent } from '../../../shared/lib/quest-submit-validation';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const submitSchema = z.object({
  userChallengeId: z.string().uuid().optional(),
  verificationType: z.enum(['image', 'video', 'link', 'text']),
  content: z.object({
    imageUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
    videoDurationSec: z.number().min(0).max(60).optional(),
    thumbnailUrl: z.string().url().optional(),
    linkUrl: z.string().url().optional(),
    textContent: z.string().min(1).max(2000).optional(),
    note: z.string().max(500).optional(),
  }),
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function isTransactionConditionFailed(error: any): boolean {
  if (error?.name !== 'TransactionCanceledException') return false;
  const reasons = error?.CancellationReasons;
  return Array.isArray(reasons) && reasons.some((r: any) => r?.Code === 'ConditionalCheckFailed');
}

function isRetriableHistoryLookupError(error: any): boolean {
  const code = String(error?.name || error?.Code || '');
  const message = String(error?.message || '');

  if (code === 'ValidationException' && message.includes('IndexName')) return true;
  if (code === 'ResourceNotFoundException') return true;
  return false;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const questId = event.pathParameters?.questId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    if (!questId) return response(400, { error: 'MISSING_QUEST_ID', message: '퀘스트 ID가 필요합니다' });

    const body = JSON.parse(event.body || '{}');
    const input = submitSchema.parse(body);

    const questResult = await docClient.send(new GetCommand({
      TableName: process.env.QUESTS_TABLE!,
      Key: { questId },
    }));

    if (!questResult.Item) {
      return response(404, { error: 'QUEST_NOT_FOUND', message: '퀘스트를 찾을 수 없습니다' });
    }

    const quest = questResult.Item;
    const now = new Date().toISOString();

    if (quest.status !== 'active') return response(409, { error: 'QUEST_INACTIVE', message: '비활성화된 퀘스트입니다' });
    if (quest.startAt > now) return response(409, { error: 'QUEST_NOT_STARTED', message: '아직 시작되지 않은 퀘스트입니다' });
    if (quest.endAt && quest.endAt < now) return response(409, { error: 'QUEST_EXPIRED', message: '기간이 만료된 퀘스트입니다' });

    // 퀘스트의 허용 인증 방식 (신규: allowedVerificationTypes, 구버전 호환: verificationType)
    const questAllowedTypes: string[] = Array.isArray(quest.allowedVerificationTypes) && quest.allowedVerificationTypes.length > 0
      ? quest.allowedVerificationTypes
      : quest.verificationType ? [quest.verificationType] : ['image', 'video', 'link', 'text'];

    if (!questAllowedTypes.includes(input.verificationType)) {
      return response(400, {
        error: 'VERIFICATION_TYPE_NOT_ALLOWED',
        message: `이 퀘스트에서 허용되지 않는 인증 방식입니다. 허용: ${questAllowedTypes.join(', ')}`,
      });
    }

    const normalizedContent = normalizeQuestSubmissionContent(input.content);

    const contentError = validateQuestSubmissionContent(quest, normalizedContent, input.verificationType);
    if (contentError) {
      return response(400, { error: 'INVALID_CONTENT', message: contentError });
    }

    let previousAttempts: any[] = [];
    try {
      const historyResult = await docClient.send(new QueryCommand({
        TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
        IndexName: 'userId-createdAt-index',
        KeyConditionExpression: 'userId = :uid',
        FilterExpression: 'questId = :qid',
        ExpressionAttributeValues: { ':uid': userId, ':qid': questId },
        ScanIndexForward: false,
      }));
      previousAttempts = historyResult.Items ?? [];
    } catch (historyLookupError: any) {
      if (!isRetriableHistoryLookupError(historyLookupError)) {
        throw historyLookupError;
      }
      console.warn('Quest submission history lookup skipped due to missing index/resource:', {
        errorName: historyLookupError?.name,
        message: historyLookupError?.message,
      });
    }

    const attemptNumber = previousAttempts.length + 1;
    const lastRejected = previousAttempts.find((s: any) => s.status === 'rejected');
    const previousSubmissionId = lastRejected?.submissionId ?? null;

    const submissionId = uuidv4();
    const autoApprove = !quest.approvalRequired;
    const status = autoApprove ? 'auto_approved' : 'pending';
    const activeSubmissionId = `${userId}#${questId}`;

    const submission = {
      submissionId,
      questId,
      userId,
      challengeId: quest.challengeId ?? null,
      userChallengeId: input.userChallengeId ?? null,
      verificationType: input.verificationType,
      content: normalizedContent,
      status,
      rewardGranted: autoApprove,
      previousSubmissionId,
      attemptNumber,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
    };

    try {
      await docClient.send(new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: process.env.ACTIVE_QUEST_SUBMISSIONS_TABLE!,
              Key: { activeSubmissionId },
              ConditionExpression: 'attribute_not_exists(activeSubmissionId)',
            },
          },
          {
            Put: {
              TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
              Item: submission,
            },
          },
          {
            Put: {
              TableName: process.env.ACTIVE_QUEST_SUBMISSIONS_TABLE!,
              Item: {
                activeSubmissionId,
                userId,
                questId,
                submissionId,
                status,
                createdAt: now,
                updatedAt: now,
              },
            },
          },
          {
            Update: {
              TableName: process.env.QUESTS_TABLE!,
              Key: { questId },
              UpdateExpression: 'SET submissionCount = if_not_exists(submissionCount, :zero) + :inc, updatedAt = :now',
              ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': now },
            },
          },
        ],
      }));
    } catch (err: any) {
      if (isTransactionConditionFailed(err)) {
        const activeResult = await docClient.send(new GetCommand({
          TableName: process.env.ACTIVE_QUEST_SUBMISSIONS_TABLE!,
          Key: { activeSubmissionId },
        }));

        return response(409, {
          error: 'ALREADY_SUBMITTED',
          message: '이미 제출한 퀘스트입니다',
          status: activeResult.Item?.status,
          submissionId: activeResult.Item?.submissionId,
        });
      }
      throw err;
    }

    return response(201, {
      success: true,
      message: autoApprove
        ? '제출이 완료되었습니다 (자동 승인)'
        : '제출이 완료되었습니다. 관리자 검토 후 포인트가 지급됩니다.',
      data: {
        submissionId,
        status,
        attemptNumber,
        rewardGranted: autoApprove,
        rewardPoints: autoApprove ? quest.rewardPoints : 0,
      },
    });
  } catch (error: any) {
    console.error('Submit quest error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
