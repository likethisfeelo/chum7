import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { sendNotification } from '../../../../shared/lib/notification';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const schema = z.object({
  userChallengeId: z.string().uuid(),
  title: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  allowedVerificationTypes: z.array(z.enum(['image', 'text', 'link', 'video'])).min(1).optional(),
  verificationType: z.enum(['image', 'text', 'link', 'video']).optional(), // 구버전 호환
});

function response(statusCode: number, body: any): APIGatewayProxyResult { return { statusCode, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) }; }

const KST_MS = 9 * 60 * 60 * 1000;
const deadline = (startAt: string) => {
  // challengeStartAt을 KST로 변환하여 D-1 23:59 KST를 계산한 뒤 UTC로 반환
  const kst = new Date(new Date(startAt).getTime() + KST_MS);
  kst.setUTCDate(kst.getUTCDate() - 1);
  kst.setUTCHours(23, 59, 0, 0);
  return new Date(kst.getTime() - KST_MS).toISOString();
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const challengeId = event.pathParameters?.challengeId;
    if (!userId) return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    if (!challengeId) return response(400, { error: 'MISSING_CHALLENGE_ID', message: '챌린지 ID가 필요합니다' });
    const input = schema.parse(JSON.parse(event.body || '{}'));

    const [ucRes, challengeRes] = await Promise.all([
      docClient.send(new GetCommand({ TableName: process.env.USER_CHALLENGES_TABLE!, Key: { userChallengeId: input.userChallengeId } })),
      docClient.send(new GetCommand({ TableName: process.env.CHALLENGES_TABLE!, Key: { challengeId } })),
    ]);
    const uc = ucRes.Item; const challenge = challengeRes.Item;
    if (!uc || uc.userId !== userId || uc.challengeId !== challengeId) return response(403, { error: 'FORBIDDEN', message: '본인 참여 정보만 제출할 수 있습니다' });
    if (!challenge) return response(404, { error: 'CHALLENGE_NOT_FOUND', message: '챌린지를 찾을 수 없습니다' });
    if (!challenge.personalQuestEnabled) return response(400, { error: 'PERSONAL_QUEST_DISABLED', message: '개인 퀘스트 제안이 비활성화된 챌린지입니다' });
    if (!['recruiting','preparing'].includes(String(challenge.lifecycle || ''))) return response(409, { error: 'INVALID_LIFECYCLE', message: '제안 제출 가능 기간이 아닙니다' });

    const registrationDeadline = deadline(challenge.challengeStartAt);
    if (new Date().toISOString() > registrationDeadline) return response(409, { error: 'PROPOSAL_DEADLINE_PASSED', message: '제안 제출 마감이 지났습니다' });

    const existing = await docClient.send(new QueryCommand({
      TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!,
      IndexName: 'userId-challengeId-index',
      KeyConditionExpression: 'userId = :uid AND challengeId = :cid',
      ExpressionAttributeValues: { ':uid': userId, ':cid': challengeId },
    }));
    const items = existing.Items || [];
    if (items.some((p: any) => p.status === 'approved')) return response(409, { error: 'ALREADY_APPROVED', message: '이미 승인된 개인 퀘스트가 있습니다' });

    const rejectedCount = items.filter((p: any) => p.status === 'rejected').length;
    if (rejectedCount > 2) return response(409, { error: 'PROPOSAL_EXPIRED', message: '수정 가능 횟수를 초과했습니다' });

    const proposalId = uuidv4();
    const now = new Date().toISOString();
    const auto = challenge.personalQuestAutoApprove ?? false;

    // 허용 인증 방식: 신규 allowedVerificationTypes 우선, 구버전 verificationType 폴백
    const defaultAllowed = ['image', 'text', 'link', 'video'];
    const rawChallengeAllowed = challenge.allowedVerificationTypes as string[] | undefined;
    const challengeAllowed = rawChallengeAllowed?.length ? rawChallengeAllowed.filter(t => defaultAllowed.includes(t)) : defaultAllowed;
    const proposedAllowed = input.allowedVerificationTypes?.length
      ? input.allowedVerificationTypes.filter(t => challengeAllowed.includes(t))
      : input.verificationType ? [input.verificationType] : challengeAllowed;
    const effectiveAllowedTypes = proposedAllowed.length > 0 ? proposedAllowed : challengeAllowed;

    const item = {
      proposalId,
      challengeId,
      userId,
      userChallengeId: input.userChallengeId,
      title: input.title,
      description: input.description || '',
      allowedVerificationTypes: effectiveAllowedTypes,
      verificationType: effectiveAllowedTypes[0], // 하위호환
      status: auto ? 'approved' : 'pending',
      revisionCount: 0,
      leaderFeedback: null,
      registrationDeadline,
      createdAt: now,
      updatedAt: now,
    };
    await docClient.send(new PutCommand({ TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!, Item: item }));

    if (!auto && challenge.createdBy) {
      await sendNotification({ recipientId: challenge.createdBy, type: 'quest_proposal_submitted', title: '개인 퀘스트 제안이 도착했어요', body: `${input.title} 제안서 심사가 필요해요.`, relatedId: proposalId, relatedType: 'personal_quest_proposal' });
    }

    return response(201, { success: true, data: item });
  } catch (error: any) {
    if (error instanceof z.ZodError) return response(400, { error: 'VALIDATION_ERROR', details: error.errors, message: '입력값이 올바르지 않습니다' });
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
