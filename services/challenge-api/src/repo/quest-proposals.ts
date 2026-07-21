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
