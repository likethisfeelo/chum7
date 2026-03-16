import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { sendNotification } from '../../../../shared/lib/notification';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const schema = z.object({ title: z.string().min(1).max(100), description: z.string().max(1000).optional(), verificationType: z.enum(['image', 'text', 'link', 'video']) });
const res = (statusCode: number, body: any): APIGatewayProxyResult => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
  const proposalId = event.pathParameters?.proposalId;
  if (!userId) return res(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
  if (!proposalId) return res(400, { error: 'MISSING_PROPOSAL_ID', message: 'proposalId가 필요합니다' });

  const input = schema.parse(JSON.parse(event.body || '{}'));
  const got = await docClient.send(new GetCommand({ TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!, Key: { proposalId } }));
  const proposal = got.Item;
  if (!proposal) return res(404, { error: 'PROPOSAL_NOT_FOUND', message: '제안서를 찾을 수 없습니다' });
  if (proposal.userId !== userId) return res(403, { error: 'FORBIDDEN', message: '본인 제안서만 수정할 수 있습니다' });
  if (proposal.status !== 'rejected') return res(409, { error: 'INVALID_STATUS', message: '반려 상태에서만 재제출할 수 있습니다' });
  if ((proposal.revisionCount || 0) >= 2) {
    await docClient.send(new UpdateCommand({ TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!, Key: { proposalId }, UpdateExpression: 'SET #status = :expired, updatedAt = :now', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':expired': 'expired', ':now': new Date().toISOString() } }));
    return res(409, { error: 'PROPOSAL_EXPIRED', message: '수정 가능 횟수를 초과했습니다' });
  }
  // lifecycle 기반 차단은 챌린지 조회 후 처리 - 별도 deadline 검사 제거

  const now = new Date().toISOString();
  const revisionCount = (proposal.revisionCount || 0) + 1;
  await docClient.send(new UpdateCommand({
    TableName: process.env.PERSONAL_QUEST_PROPOSALS_TABLE!,
    Key: { proposalId },
    UpdateExpression: 'SET title = :title, description = :desc, verificationType = :vt, #status = :status, revisionCount = :rc, updatedAt = :now, leaderFeedback = :fb',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':title': input.title, ':desc': input.description || '', ':vt': input.verificationType, ':status': 'revision_pending', ':rc': revisionCount, ':now': now, ':fb': null },
  }));

  const challengeRes = await docClient.send(new GetCommand({ TableName: process.env.CHALLENGES_TABLE!, Key: { challengeId: proposal.challengeId } }));
  if (challengeRes.Item?.createdBy) {
    await sendNotification({ recipientId: challengeRes.Item.createdBy, type: 'quest_proposal_revised', title: '수정된 퀘스트 확인이 필요해요 🔄', body: input.title, relatedId: proposalId, relatedType: 'personal_quest_proposal' });
  }

  return res(200, { success: true });
};
