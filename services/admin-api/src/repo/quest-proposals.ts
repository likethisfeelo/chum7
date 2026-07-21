/**
 * challenges 테이블 — 개인 퀘스트 제안 심사 액세스
 * (challenge-api repo/quest-proposals.ts 키 패턴 복사 — 서비스 간 import 금지).
 *  제안: pk=`CHAL#<challengeId>`, sk=`QPROP#<userId>#<proposalId>`
 * 심사 목록 = pk 파티션 `QPROP#` Query (신규 키에 전역 status 인덱스 없음 — 풀스캔 금지).
 */
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './challenges';

/** 챌린지의 제안 전체 — pk 파티션 QPROP# Query */
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
  /** 반려 사유 — 유저 화면의 leaderFeedback 필드로 저장 (레거시 필드명 승계) */
  reason: string | null;
  reviewerId: string;
  nowIso: string;
}

/**
 * 심사 반영 — pending 조건부 갱신 (중복 심사 방지, 레거시 ALREADY_REVIEWED 가드).
 * 조건 실패 시 false 반환.
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
