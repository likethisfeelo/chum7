import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { sendNotification } from '../../../../shared/lib/notification';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const schema = z.object({ action: z.enum(['approve', 'reject']), leaderFeedback: z.string().min(10).max(500).optional() });
const res = (statusCode: number, body: any): APIGatewayProxyResult => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const proposalId = event.pathParameters?.proposalId;
  if (!proposalId) return res(400, { error: 'MISSING_PROPOSAL_ID', message: 'proposalId가 필요합니다' });
  const input = schema.parse(JSON.parse(event.body || '{}'));
  if (input.action === 'reject' && !input.leaderFeedback) return res(400, { error: 'LEADER_FEEDBACK_REQUIRED', message: '반려 시 피드백은 필수입니다' });

  const got = await docClient.send(new GetCommand({ TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!, Key: { proposalId } }));
  const proposal = got.Item;
  if (!proposal) return res(404, { error: 'PROPOSAL_NOT_FOUND', message: '제안서를 찾을 수 없습니다' });

  // 이미 처리된 제안서 중복 심사 방지
  if (proposal.status !== 'pending' && proposal.status !== 'revision_pending') {
    return res(409, { error: 'ALREADY_REVIEWED', message: `이미 처리된 제안서입니다 (status: ${proposal.status})` });
  }

  const now = new Date().toISOString();
  let status = input.action === 'approve' ? 'approved' : 'rejected';
  if (input.action === 'reject' && (proposal.revisionCount || 0) >= 2) status = 'expired';

  await docClient.send(new UpdateCommand({
    TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!,
    Key: { proposalId },
    UpdateExpression: 'SET #status = :status, leaderFeedback = :fb, updatedAt = :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status, ':fb': input.leaderFeedback || null, ':now': now },
  }));

  // 승인 시 QUESTS_TABLE에 개인 퀘스트 레코드 생성 → 퀘스트 보드에 표시되기 위함
  if (status === 'approved' && process.env.QUESTS_TABLE) {
    const challengeResult = process.env.CHALLENGES_TABLE
      ? await docClient.send(new GetCommand({ TableName: process.env.CHALLENGES_TABLE, Key: { challengeId: proposal.challengeId } })).catch(() => ({ Item: null }))
      : { Item: null };
    const challenge = challengeResult.Item;

    const questId = uuidv4();
    await docClient.send(new PutCommand({
      TableName: process.env.QUESTS_TABLE,
      Item: {
        questId,
        challengeId: proposal.challengeId,
        title: proposal.title,
        description: proposal.description || '',
        questScope: 'personal',
        assignedUserId: proposal.userId,
        allowedVerificationTypes: proposal.allowedVerificationTypes,
        verificationType: proposal.verificationType,
        rewardPoints: challenge?.personalQuestRewardPoints ?? 100,
        approvalRequired: !(challenge?.personalQuestAutoApprove ?? false),
        status: 'active',
        questLayer: 'A',
        displayOrder: 0,
        startAt: now,
        createdAt: now,
        updatedAt: now,
        sourceProposalId: proposal.proposalId,
      },
    }));

    // 생성된 questId를 proposal에도 저장 (연결 추적용)
    await docClient.send(new UpdateCommand({
      TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!,
      Key: { proposalId },
      UpdateExpression: 'SET questId = :qid',
      ExpressionAttributeValues: { ':qid': questId },
    }));
  }

  if (status === 'approved') {
    await sendNotification({ recipientId: proposal.userId, type: 'quest_proposal_approved', title: '퀘스트가 승인됐어요 ✅', body: proposal.title, relatedId: proposalId, relatedType: 'personal_quest_proposal' });
  } else if (status === 'expired') {
    await sendNotification({ recipientId: proposal.userId, type: 'quest_proposal_expired', title: '개인 퀘스트 제안이 만료되었어요', body: '수정 가능 횟수를 초과했습니다.', relatedId: proposalId, relatedType: 'personal_quest_proposal' });
  } else {
    await sendNotification({ recipientId: proposal.userId, type: 'quest_proposal_rejected', title: '퀘스트 수정 요청이 있어요. 피드백을 확인하세요.', body: input.leaderFeedback!, relatedId: proposalId, relatedType: 'personal_quest_proposal' });
  }

  return res(200, { success: true, data: { ...proposal, status, leaderFeedback: input.leaderFeedback || null, updatedAt: now } });
};
