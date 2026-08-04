/**
 * challenges 테이블 — 인증 완료 인정 요청(사용자→리더).
 *  pk=`CHAL#<challengeId>`, sk=`CREQ#<userId>#<requestId>`
 *  내 요청 = sk prefix Query, 리더 큐 = pk 파티션 `CREQ#` Query. (quest-proposals 패턴 승계)
 */
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './shared';

export const completionRequestSk = (userId: string, requestId: string) =>
  `CREQ#${userId}#${requestId}`;

export async function putCompletionRequest(item: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: item,
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
}

export async function listMyCompletionRequests(
  challengeId: string,
  userId: string,
): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':prefix': `CREQ#${userId}#` },
    }),
  );
  return res.Items ?? [];
}

/** 리더 심사 큐 — pk 파티션 CREQ# Query */
export async function listChallengeCompletionRequests(
  challengeId: string,
): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :q)',
        ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':q': 'CREQ#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export async function findCompletionRequestById(
  challengeId: string,
  requestId: string,
): Promise<Record<string, any> | undefined> {
  const items = await listChallengeCompletionRequests(challengeId);
  return items.find((item) => item.requestId === requestId);
}

/** 처리 반영 — pending 조건부 갱신(중복 처리 방지). 조건 실패 시 false. */
export async function updateCompletionRequestReview(input: {
  challengeId: string;
  userId: string;
  requestId: string;
  status: 'approved' | 'rejected';
  reviewerId: string;
  feedback?: string | null;
  nowIso: string;
}): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: {
          pk: challengePk(input.challengeId),
          sk: completionRequestSk(input.userId, input.requestId),
        },
        UpdateExpression:
          'SET #st = :status, leaderFeedback = :fb, reviewedBy = :reviewer, reviewedAt = :now, updatedAt = :now',
        ConditionExpression: '#st = :pending',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':status': input.status,
          ':pending': 'pending',
          ':fb': input.feedback ?? null,
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
