/**
 * PUT /admin/quests/submissions/{submissionId}/review
 * 관리자가 퀘스트 제출물을 승인/거절한다.
 *
 * 승인(approve):
 *   - questSubmissions.status    = 'approved'
 *   - questSubmissions.rewardGranted = true
 *   - activeQuestSubmissions.status  = 'approved'  (레코드 유지 → 재제출 차단)
 *   - quests.approvedCount      += 1
 *
 * 거절(reject):
 *   - questSubmissions.status    = 'rejected'
 *   - activeQuestSubmissions     DELETE          (레코드 삭제 → 재제출 허용)
 *
 * 재제출 후 다시 심사:
 *   - 새 submissionId로 동일 흐름 반복
 *   - 이전 시도는 questSubmissions에 previousSubmissionId로 체인 보관
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const reviewSchema = z.object({
  action:     z.enum(['approve', 'reject']),
  reviewNote: z.string().max(500).optional(),
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
  if (Array.isArray(rawGroups)) return rawGroups.map(String).map(g => g.trim()).filter(Boolean);
  if (typeof rawGroups !== 'string') return [];

  const value = rawGroups.trim();
  if (!value) return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).map(g => g.trim()).filter(Boolean);
    } catch {
      // fall through
    }
  }

  return value
    .split(/[,:]/)
    .map(g => g.replace(/[\[\]\"']/g, '').trim())
    .filter(Boolean);
}

function canReviewSubmission(event: APIGatewayProxyEvent): boolean {
  const groupsRaw = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  const groups = parseGroups(groupsRaw);
  const allowed = new Set(['admins', 'productowners', 'managers', 'leaders']);
  return groups.some(group => allowed.has(group));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const submissionId = event.pathParameters?.submissionId;
    if (!submissionId) {
      return response(400, { error: 'MISSING_SUBMISSION_ID' });
    }

    const body  = JSON.parse(event.body || '{}');
    const input = reviewSchema.parse(body);

    // ── 1. 이력 테이블에서 제출물 조회 ────────────────────────────────
    const submissionResult = await docClient.send(new GetCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      Key: { submissionId },
    }));
    if (!submissionResult.Item) {
      return response(404, { error: 'SUBMISSION_NOT_FOUND', message: '제출물을 찾을 수 없습니다' });
    }

    const submission = submissionResult.Item;

    const questResult = await docClient.send(new GetCommand({
      TableName: process.env.QUESTS_TABLE!,
      Key: { questId: submission.questId },
    }));

    if (!questResult.Item) {
      return response(404, { error: 'QUEST_NOT_FOUND', message: '퀘스트를 찾을 수 없습니다' });
    }

    const quest = questResult.Item;
    const challengeResult = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId: quest.challengeId },
    }));

    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const isCreator = challengeResult.Item?.createdBy && challengeResult.Item.createdBy === requesterId;
    if (!canReviewSubmission(event) && !isCreator) {
      return response(403, { error: 'FORBIDDEN', message: '제출물 심사 권한이 없습니다' });
    }

    if (submission.status !== 'pending') {
      return response(409, {
        error:   'ALREADY_REVIEWED',
        message: `이미 처리된 제출물입니다 (status: ${submission.status})`,
      });
    }

    const now        = new Date().toISOString();
    const reviewerId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const newStatus  = input.action === 'approve' ? 'approved' : 'rejected';

    // ── 2. questSubmissions 이력 업데이트 ─────────────────────────────
    await docClient.send(new UpdateCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      Key: { submissionId },
      UpdateExpression: 'SET #status = :status, rewardGranted = :reward, reviewNote = :note, reviewedBy = :reviewer, reviewedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status':   newStatus,
        ':reward':   input.action === 'approve',
        ':note':     input.reviewNote ?? null,
        ':reviewer': reviewerId,
        ':now':      now,
      },
    }));

    // ── 3. activeQuestSubmissions 처리 ─────────────────────────────────
    const activeSubmissionId = `${submission.userId}#${submission.questId}`;

    if (input.action === 'approve') {
      // 승인: active 레코드 유지, status만 'approved'로 변경 → 재제출 차단
      await docClient.send(new UpdateCommand({
        TableName: process.env.ACTIVE_QUEST_SUBMISSIONS_TABLE!,
        Key: { activeSubmissionId },
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'approved', ':now': now },
      }));

      // 퀘스트 approvedCount 증가
      await docClient.send(new UpdateCommand({
        TableName: process.env.QUESTS_TABLE!,
        Key: { questId: submission.questId },
        UpdateExpression: 'SET approvedCount = if_not_exists(approvedCount, :zero) + :inc, updatedAt = :now',
        ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': now },
      }));

    } else {
      // 거절: active 레코드 삭제 → 재제출 허용
      await docClient.send(new DeleteCommand({
        TableName: process.env.ACTIVE_QUEST_SUBMISSIONS_TABLE!,
        Key: { activeSubmissionId },
      }));
    }

    return response(200, {
      success: true,
      message: input.action === 'approve'
        ? '제출물이 승인되었습니다'
        : '제출물이 거절되었습니다. 사용자가 재제출할 수 있습니다.',
      data: {
        submissionId,
        status:        newStatus,
        rewardGranted: input.action === 'approve',
        canResubmit:   input.action === 'reject',  // 클라이언트 UX 힌트
      },
    });

  } catch (error: any) {
    console.error('Review quest submission error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
