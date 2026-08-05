/**
 * challenges 테이블 — 유료 챌린지 해산 신청(리더→운영자).
 *  pk=`CHAL#<challengeId>`, sk=`DISBANDREQ#<requestId>`
 *  gsi2pk=`DISBANDREQ#<status>`, gsi2sk=`<createdAt>` (운영자 큐 — status별 조회)
 * 운영자 검토는 admin-api repo/disband-requests.ts 에서 gsi2 파티션 Query.
 */
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './shared';

export const disbandRequestSk = (requestId: string) => `DISBANDREQ#${requestId}`;
export const disbandRequestQueuePk = (status: string) => `DISBANDREQ#${status}`;

export async function putDisbandRequest(item: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: item,
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
}

/** 이 챌린지의 해산 신청 목록 — pk 파티션 DISBANDREQ# prefix Query (중복 신청 검사용). */
export async function listChallengeDisbandRequests(challengeId: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :q)',
      ExpressionAttributeValues: { ':pk': challengePk(challengeId), ':q': 'DISBANDREQ#' },
    }),
  );
  return res.Items ?? [];
}
