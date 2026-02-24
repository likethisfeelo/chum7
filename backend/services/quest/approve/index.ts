/**
 * PUT /admin/quests/submissions/{submissionId}/review
 * 관리자가 퀘스트 제출물을 승인/거절한다.
 *
 * 승인 시: rewardGranted = true, approvedCount++, 포인트 지급 (향후 users 테이블 업데이트)
 * 거절 시: 사용자가 재제출 가능 (status = 'rejected')
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reviewNote: z.string().max(500).optional(),
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin(event)) {
      return response(403, { error: 'FORBIDDEN', message: '관리자 권한이 필요합니다' });
    }

    const submissionId = event.pathParameters?.submissionId;
    if (!submissionId) {
      return response(400, { error: 'MISSING_SUBMISSION_ID' });
    }

    const body = JSON.parse(event.body || '{}');
    const input = reviewSchema.parse(body);

    // 1. 제출물 조회
    const submissionResult = await docClient.send(new GetCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      Key: { submissionId },
    }));
    if (!submissionResult.Item) {
      return response(404, { error: 'SUBMISSION_NOT_FOUND', message: '제출물을 찾을 수 없습니다' });
    }

    const submission = submissionResult.Item;

    if (submission.status !== 'pending') {
      return response(409, {
        error: 'ALREADY_REVIEWED',
        message: `이미 처리된 제출물입니다 (status: ${submission.status})`,
      });
    }

    const now = new Date().toISOString();
    const reviewerId = event.requestContext.authorizer?.jwt?.claims?.sub || 'admin';

    const newStatus = input.action === 'approve' ? 'approved' : 'rejected';
    const rewardGranted = input.action === 'approve';

    // 2. 제출물 상태 업데이트
    await docClient.send(new UpdateCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      Key: { submissionId },
      UpdateExpression: 'SET #status = :status, rewardGranted = :reward, reviewNote = :note, reviewedBy = :reviewer, reviewedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': newStatus,
        ':reward': rewardGranted,
        ':note': input.reviewNote ?? null,
        ':reviewer': reviewerId,
        ':now': now,
      },
    }));

    // 3. 승인 시 퀘스트 approvedCount 증가
    if (rewardGranted) {
      await docClient.send(new UpdateCommand({
        TableName: process.env.QUESTS_TABLE!,
        Key: { questId: submission.questId },
        UpdateExpression: 'SET approvedCount = if_not_exists(approvedCount, :zero) + :inc, updatedAt = :now',
        ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': now },
      }));
    }

    return response(200, {
      success: true,
      message: input.action === 'approve' ? '제출물이 승인되었습니다' : '제출물이 거절되었습니다',
      data: { submissionId, status: newStatus, rewardGranted },
    });

  } catch (error: any) {
    console.error('Review quest submission error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
