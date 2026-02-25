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
 *
 * 흐름:
 *   1. activeQuestSubmissions GetItem으로 기존 제출 확인
 *   2. 없으면 questSubmissions에서 이전 이력 조회 (attemptNumber, previousSubmissionId)
 *   3. questSubmissions PutItem (이력 기록)
 *   4. activeQuestSubmissions ConditionalPutItem
 *      → 실패(ConditionalCheckFailed) = 동시 race condition → ALREADY_SUBMITTED
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const submitSchema = z.object({
  userChallengeId: z.string().uuid().optional(),
  content: z.object({
    imageUrl:     z.string().url().optional(),
    videoUrl:     z.string().url().optional(),
    thumbnailUrl: z.string().url().optional(),
    linkUrl:      z.string().url().optional(),
    textContent:  z.string().min(1).max(2000).optional(),
    note:         z.string().max(500).optional(),
  }),
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function validateContent(quest: any, content: any): string | null {
  switch (quest.verificationType) {
    case 'image':
      if (!content.imageUrl) return '이미지 URL이 필요합니다';
      break;
    case 'video':
      if (!content.videoUrl) return '영상 URL이 필요합니다';
      break;
    case 'link':
      if (!content.linkUrl) return 'URL이 필요합니다';
      if (quest.verificationConfig?.linkPattern) {
        try {
          const regex = new RegExp(quest.verificationConfig.linkPattern);
          if (!regex.test(content.linkUrl)) return 'URL 형식이 올바르지 않습니다';
        } catch {
          // 잘못된 regex 패턴이면 검증 스킵
        }
      }
      break;
    case 'text':
      if (!content.textContent) return '내용을 입력해 주세요';
      const maxChars = quest.verificationConfig?.maxChars ?? 2000;
      if (content.textContent.length > maxChars) {
        return `내용은 ${maxChars}자 이내로 작성해 주세요`;
      }
      break;
  }
  return null;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId  = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const questId = event.pathParameters?.questId;

    if (!userId)  return response(401, { error: 'UNAUTHORIZED',     message: '인증이 필요합니다' });
    if (!questId) return response(400, { error: 'MISSING_QUEST_ID', message: '퀘스트 ID가 필요합니다' });

    const body  = JSON.parse(event.body || '{}');
    const input = submitSchema.parse(body);

    // ── 1. 퀘스트 조회 및 기간/상태 검증 ──────────────────────────────
    const questResult = await docClient.send(new GetCommand({
      TableName: process.env.QUESTS_TABLE!,
      Key: { questId },
    }));
    if (!questResult.Item) {
      return response(404, { error: 'QUEST_NOT_FOUND', message: '퀘스트를 찾을 수 없습니다' });
    }
    const quest = questResult.Item;
    const now   = new Date().toISOString();

    if (quest.status !== 'active')        return response(409, { error: 'QUEST_INACTIVE',    message: '비활성화된 퀘스트입니다' });
    if (quest.startAt > now)              return response(409, { error: 'QUEST_NOT_STARTED', message: '아직 시작되지 않은 퀘스트입니다' });
    if (quest.endAt && quest.endAt < now) return response(409, { error: 'QUEST_EXPIRED',     message: '기간이 만료된 퀘스트입니다' });

    // ── 2. 중복 제출 확인 (activeQuestSubmissions 단일 GetItem O(1)) ──
    const activeSubmissionId = `${userId}#${questId}`;
    const activeResult = await docClient.send(new GetCommand({
      TableName: process.env.ACTIVE_QUEST_SUBMISSIONS_TABLE!,
      Key: { activeSubmissionId },
    }));

    if (activeResult.Item) {
      return response(409, {
        error:        'ALREADY_SUBMITTED',
        message:      '이미 제출한 퀘스트입니다',
        status:       activeResult.Item.status,
        submissionId: activeResult.Item.submissionId,
      });
    }

    // ── 3. 컨텐츠 유효성 검증 ───────────────────────────────────────────
    const contentError = validateContent(quest, input.content);
    if (contentError) {
      return response(400, { error: 'INVALID_CONTENT', message: contentError });
    }

    // ── 4. 이전 이력 조회 (재제출 체인 구성) ───────────────────────────
    // userId-createdAt-index에서 이 퀘스트의 이전 시도 조회
    const historyResult = await docClient.send(new QueryCommand({
      TableName:  process.env.QUEST_SUBMISSIONS_TABLE!,
      IndexName:  'userId-createdAt-index',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression:       'questId = :qid',
      ExpressionAttributeValues: { ':uid': userId, ':qid': questId },
      ScanIndexForward: false, // 최신순 (최신 rejected를 빠르게 찾기 위해)
    }));

    const previousAttempts     = historyResult.Items ?? [];
    const attemptNumber        = previousAttempts.length + 1;
    // 가장 최근 rejected 제출을 previousSubmissionId로 연결
    const lastRejected         = previousAttempts.find(s => s.status === 'rejected');
    const previousSubmissionId = lastRejected?.submissionId ?? null;

    // ── 5. questSubmissions 이력 기록 (append-only) ─────────────────────
    const submissionId = uuidv4();
    const autoApprove  = !quest.approvalRequired;
    const status       = autoApprove ? 'auto_approved' : 'pending';

    const submission = {
      submissionId,
      questId,
      userId,
      challengeId:          quest.challengeId ?? null,
      userChallengeId:      input.userChallengeId ?? null,
      verificationType:     quest.verificationType,
      content:              input.content,
      status,
      rewardGranted:        autoApprove,
      previousSubmissionId,   // 이전 rejected 제출 ID (재제출 체인)
      attemptNumber,          // 몇 번째 시도
      reviewNote:   null,
      reviewedBy:   null,
      reviewedAt:   null,
      createdAt:    now,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      Item: submission,
    }));

    // ── 6. activeQuestSubmissions ConditionalPutItem ────────────────────
    // attribute_not_exists 조건 실패 = race condition → 중복 제출 거부
    try {
      await docClient.send(new PutCommand({
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
        ConditionExpression: 'attribute_not_exists(activeSubmissionId)',
      }));
    } catch (err: any) {
      if (err.name === 'ConditionalCheckFailedException') {
        return response(409, {
          error:   'ALREADY_SUBMITTED',
          message: '동시에 제출이 처리되었습니다',
        });
      }
      throw err;
    }

    // ── 7. 퀘스트 submissionCount 업데이트 ─────────────────────────────
    await docClient.send(new UpdateCommand({
      TableName: process.env.QUESTS_TABLE!,
      Key: { questId },
      UpdateExpression: 'SET submissionCount = if_not_exists(submissionCount, :zero) + :inc, updatedAt = :now',
      ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': now },
    }));

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
        rewardPoints:  autoApprove ? quest.rewardPoints : 0,
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
