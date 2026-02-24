/**
 * POST /quests/{questId}/submit
 * 사용자가 퀘스트를 제출한다.
 *
 * verificationType별 content 필드:
 *   image : { imageUrl: string, note?: string }
 *   video : { videoUrl: string, thumbnailUrl?: string, note?: string }
 *   link  : { linkUrl: string, note?: string }
 *   text  : { textContent: string }
 *
 * approvalRequired = false → status = 'auto_approved', 포인트 즉시 지급
 * approvalRequired = true  → status = 'pending', 관리자 검토 대기
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const submitSchema = z.object({
  userChallengeId: z.string().uuid().optional(),  // 챌린지 참여 연결 (optional)
  content: z.object({
    imageUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
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
        const regex = new RegExp(quest.verificationConfig.linkPattern);
        if (!regex.test(content.linkUrl)) return 'URL 형식이 올바르지 않습니다';
      }
      break;
    case 'text':
      if (!content.textContent) return '내용을 입력해 주세요';
      const maxChars = quest.verificationConfig?.maxChars ?? 2000;
      if (content.textContent.length > maxChars) return `내용은 ${maxChars}자 이내로 작성해 주세요`;
      break;
  }
  return null;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub || event.queryStringParameters?.userId;
    const questId = event.pathParameters?.questId;

    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    if (!questId) return response(400, { error: 'MISSING_QUEST_ID' });

    const body = JSON.parse(event.body || '{}');
    const input = submitSchema.parse(body);

    // 1. 퀘스트 조회
    const questResult = await docClient.send(new GetCommand({
      TableName: process.env.QUESTS_TABLE!,
      Key: { questId },
    }));
    if (!questResult.Item) {
      return response(404, { error: 'QUEST_NOT_FOUND', message: '퀘스트를 찾을 수 없습니다' });
    }
    const quest = questResult.Item;

    // 2. 퀘스트 기간 확인
    const now = new Date().toISOString();
    if (quest.status !== 'active') {
      return response(409, { error: 'QUEST_INACTIVE', message: '비활성화된 퀘스트입니다' });
    }
    if (quest.startAt > now) {
      return response(409, { error: 'QUEST_NOT_STARTED', message: '아직 시작되지 않은 퀘스트입니다' });
    }
    if (quest.endAt && quest.endAt < now) {
      return response(409, { error: 'QUEST_EXPIRED', message: '기간이 만료된 퀘스트입니다' });
    }

    // 3. 중복 제출 확인 (pending/approved 상태면 재제출 불가)
    const existingResult = await docClient.send(new QueryCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      IndexName: 'questId-status-index',
      KeyConditionExpression: 'questId = :qid AND #status IN (:pending, :approved)',
      FilterExpression: 'userId = :uid',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':qid': questId,
        ':pending': 'pending',
        ':approved': 'approved',
        ':uid': userId,
      },
    }));
    // QueryCommand에서 IN 연산자는 지원하지 않음 - 두 번 쿼리
    const pendingResult = await docClient.send(new QueryCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'questId = :qid AND #status <> :rejected',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':uid': userId,
        ':qid': questId,
        ':rejected': 'rejected',
      },
    }));
    if (pendingResult.Items && pendingResult.Items.length > 0) {
      return response(409, { error: 'ALREADY_SUBMITTED', message: '이미 제출한 퀘스트입니다' });
    }

    // 4. 컨텐츠 유효성 검증
    const contentError = validateContent(quest, input.content);
    if (contentError) {
      return response(400, { error: 'INVALID_CONTENT', message: contentError });
    }

    // 5. 제출 생성
    const submissionId = uuidv4();
    const autoApprove = !quest.approvalRequired;
    const status = autoApprove ? 'auto_approved' : 'pending';

    const submission = {
      submissionId,
      questId,
      userId,
      challengeId: quest.challengeId ?? null,
      userChallengeId: input.userChallengeId ?? null,
      verificationType: quest.verificationType,
      content: input.content,
      status,
      rewardGranted: autoApprove,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
    };

    await docClient.send(new PutCommand({
      TableName: process.env.QUEST_SUBMISSIONS_TABLE!,
      Item: submission,
    }));

    // 6. 퀘스트 submissionCount 업데이트
    await docClient.send(new UpdateCommand({
      TableName: process.env.QUESTS_TABLE!,
      Key: { questId },
      UpdateExpression: 'SET submissionCount = if_not_exists(submissionCount, :zero) + :inc, updatedAt = :now',
      ExpressionAttributeValues: { ':zero': 0, ':inc': 1, ':now': now },
    }));

    return response(201, {
      success: true,
      message: autoApprove ? '제출이 완료되었습니다 (자동 승인)' : '제출이 완료되었습니다. 관리자 검토 후 포인트가 지급됩니다.',
      data: {
        submissionId,
        status,
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
