/**
 * challenges 테이블 — 개인 퀘스트 제안 (레거시 PERSONAL_QUEST_PROPOSALS_TABLE 대체).
 *  pk=`CHAL#<challengeId>`, sk=`QPROP#<userId>#<proposalId>` (GSI 불필요 —
 *  내 제안 = sk prefix Query, 어드민 목록 = pk 파티션 `QPROP#` Query)
 */
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './shared';

export const proposalSk = (userId: string, proposalId: string) => `QPROP#${userId}#${proposalId}`;

export async function putProposal(item: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: item,
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
}

/** 내 제안 목록 — sk prefix `QPROP#<userId>#` Query (레거시 userId-challengeId-index 대응) */
export async function listMyProposals(
  challengeId: string,
  userId: string,
): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': challengePk(challengeId),
          ':prefix': `QPROP#${userId}#`,
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 챌린지의 제안 전체 — pk 파티션 QPROP# Query (리더 심사 목록용) */
export async function listChallengeProposals(challengeId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :q)',
        ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':q': 'QPROP#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** proposalId 로 제안 탐색 — 챌린지 파티션 내 필터 (신규 키에서 단독 Get 불가) */
export async function findProposalById(
  challengeId: string,
  proposalId: string,
): Promise<Record<string, any> | undefined> {
  const items = await listChallengeProposals(challengeId);
  return items.find((item) => item.proposalId === proposalId);
}

export interface ProposalReviewUpdateInput {
  challengeId: string;
  /** 제안 아이템의 sk (`QPROP#<userId>#<proposalId>`) */
  sk: string;
  status: 'approved' | 'rejected';
  reason: string | null;
  reviewerId: string;
  nowIso: string;
}

/**
 * 심사 반영 — pending 조건부 갱신 (중복 심사 방지). 조건 실패 시 false 반환.
 * (admin-api repo/quest-proposals.ts 와 동일 규칙 — 서비스 간 import 금지로 복제)
 */
export async function updateProposalReview(input: ProposalReviewUpdateInput): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: challengePk(input.challengeId), sk: input.sk },
        UpdateExpression:
          'SET #st = :status, leaderFeedback = :fb, reviewedBy = :reviewer, reviewedAt = :now, updatedAt = :now',
        ConditionExpression: '#st = :pending',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':status': input.status,
          ':pending': 'pending',
          ':fb': input.reason,
          ':reviewer': input.reviewerId,
          ':now': input.nowIso,
        },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

/**
 * 리더 재반려 — approved 조건부로 rejected 전환 (중복/경쟁 방지). 조건 실패 시 false.
 * 이미 승인(자동승인 포함)된 개인 퀘스트 제안을 리더가 다시 반려할 때 사용.
 */
export async function updateProposalReReject(input: {
  challengeId: string;
  sk: string;
  reason: string | null;
  reviewerId: string;
  nowIso: string;
}): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: challengePk(input.challengeId), sk: input.sk },
        UpdateExpression:
          'SET #st = :rejected, leaderFeedback = :fb, reviewedBy = :reviewer, reviewedAt = :now, updatedAt = :now',
        ConditionExpression: '#st = :approved',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':rejected': 'rejected',
          ':approved': 'approved',
          ':fb': input.reason,
          ':reviewer': input.reviewerId,
          ':now': input.nowIso,
        },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

/** 재제출(내용 교체 + pending 복귀) — 존재 조건부 부분 갱신 */
export async function updateProposalFields(
  challengeId: string,
  sk: string,
  attrs: Record<string, unknown>,
): Promise<void> {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  let i = 0;
  for (const [key, value] of Object.entries(attrs)) {
    i += 1;
    names[`#p${i}`] = key;
    values[`:p${i}`] = value;
    sets.push(`#p${i} = :p${i}`);
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: 'attribute_exists(sk)',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}
