/**
 * challenges 테이블 — 유료 챌린지 해산 신청 운영자 검토 액세스.
 *  pk=`CHAL#<challengeId>`, sk=`DISBANDREQ#<requestId>`
 *  gsi2pk=`DISBANDREQ#<status>`, gsi2sk=`<createdAt>` (status별 운영자 큐)
 * (challenge-api repo/disband-requests.ts 키 빌더 복사 — 서비스 간 import 금지)
 */
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './challenges';

const disbandRequestSk = (requestId: string) => `DISBANDREQ#${requestId}`;
const disbandRequestQueuePk = (status: string) => `DISBANDREQ#${status}`;

/** 상태별 해산 신청 큐 — gsi2 파티션 Query (최신순). */
export async function listDisbandRequestsByStatus(status: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pk',
        ExpressionAttributeValues: { ':pk': disbandRequestQueuePk(status) },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/**
 * 신청 처리 — pending 조건부 갱신(중복 처리 방지). gsi2pk를 새 상태 파티션으로 이동해
 * pending 큐에서 빠지고 approved/rejected 큐로 재색인된다. 조건 실패 시 false.
 */
export async function resolveDisbandRequest(input: {
  challengeId: string;
  requestId: string;
  status: 'approved' | 'rejected';
  reviewerId: string;
  reviewReason?: string | null;
  nowIso: string;
}): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: challengePk(input.challengeId), sk: disbandRequestSk(input.requestId) },
        UpdateExpression:
          'SET #st = :status, gsi2pk = :queue, reviewedBy = :reviewer, reviewReason = :reason, ' +
          'reviewedAt = :now, updatedAt = :now',
        ConditionExpression: '#st = :pending',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':status': input.status,
          ':queue': disbandRequestQueuePk(input.status),
          ':pending': 'pending',
          ':reviewer': input.reviewerId,
          ':reason': input.reviewReason ?? null,
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
