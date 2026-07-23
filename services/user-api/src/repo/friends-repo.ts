/**
 * 친구 관계 + 추천 repo (graph 테이블).
 *  - 사용자쌍 집계:  pk=USER#<uid> / sk=PAIRSTAT#<other>   (interaction-projector가 적재)
 *                    gsi1pk=REC#<uid> / gsi1sk=<zero-padded score>#<other>  (추천 후보)
 *  - 친구 관계:      pk=USER#<uid> / sk=FRIEND#<other>  { status, direction, requestedAt, acceptedAt }
 * 관계 데이터는 user-api(graph 소유)가 읽고, 원장/집계 쓰기는 projector 전담(P2 단계 A).
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const TABLE = 'GRAPH_TABLE';
const userPk = (userId: string) => `USER#${userId}`;
const pairStatSk = (other: string) => `PAIRSTAT#${other}`;
const friendSk = (other: string) => `FRIEND#${other}`;

export type FriendStatus = 'pending' | 'accepted' | 'blocked' | 'removed';

/** 추천 후보 상위 N — gsi1(REC#<uid>) 점수 내림차순 */
export async function listRecommendationStats(
  userId: string,
  limit: number,
): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': `REC#${userId}` },
      ScanIndexForward: false, // 점수 내림차순 (제로패딩 sk)
      Limit: limit,
    }),
  );
  return res.Items ?? [];
}

export async function getPairStat(
  userId: string,
  otherUserId: string,
): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: userPk(userId), sk: pairStatSk(otherUserId) } }),
  );
  return res.Item ?? null;
}

/** 친구 성립/해제 시 집계의 isFriend 갱신 + 추천 후보에서 제외/복귀(gsi1) */
export async function setPairFriendFlag(
  userId: string,
  otherUserId: string,
  isFriend: boolean,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: userPk(userId), sk: pairStatSk(otherUserId) },
      // 친구가 되면 추천에서 빠지도록 gsi1 제거. 집계 항목이 없으면 생성만.
      UpdateExpression: isFriend
        ? 'SET isFriend = :t REMOVE gsi1pk, gsi1sk'
        : 'SET isFriend = :f',
      ExpressionAttributeValues: isFriend ? { ':t': true } : { ':f': false },
    }),
  );
}

export async function getFriendEdge(
  userId: string,
  otherUserId: string,
): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: userPk(userId), sk: friendSk(otherUserId) } }),
  );
  return res.Item ?? null;
}

export async function putFriendEdge(item: {
  userId: string;
  otherUserId: string;
  status: FriendStatus;
  direction?: 'incoming' | 'outgoing' | 'mutual';
  requestedAt?: string;
  acceptedAt?: string;
}): Promise<void> {
  const existing = await getFriendEdge(item.userId, item.otherUserId);
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: userPk(item.userId),
        sk: friendSk(item.otherUserId),
        otherUserId: item.otherUserId,
        status: item.status,
        direction: item.direction ?? existing?.direction ?? 'mutual',
        requestedAt: item.requestedAt ?? existing?.requestedAt ?? new Date().toISOString(),
        acceptedAt: item.acceptedAt ?? existing?.acceptedAt ?? null,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

export async function deleteFriendEdge(userId: string, otherUserId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: userPk(userId), sk: friendSk(otherUserId) } }),
  );
}

/** 아카이브 동의 플래그 갱신 (내 엣지에만 — 상호 동의는 양쪽 플래그 AND로 판정) */
export async function setArchiveConsent(
  userId: string,
  otherUserId: string,
  patch: { timelineConsent?: boolean; fullContentConsent?: boolean },
): Promise<void> {
  const sets: string[] = ['updatedAt = :now'];
  const values: Record<string, any> = { ':now': new Date().toISOString() };
  if (typeof patch.timelineConsent === 'boolean') {
    sets.push('timelineConsent = :tc');
    values[':tc'] = patch.timelineConsent;
  }
  if (typeof patch.fullContentConsent === 'boolean') {
    sets.push('fullContentConsent = :fc');
    values[':fc'] = patch.fullContentConsent;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: userPk(userId), sk: friendSk(otherUserId) },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: 'attribute_exists(pk)', // 친구 엣지 있어야
      ExpressionAttributeValues: values,
    }),
  );
}

/** 사용자쌍 이벤트 원장(아카이브 타임라인) — PAIR#lo#hi 파티션 시간순 */
export async function listPairLedger(
  loUserId: string,
  hiUserId: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
): Promise<{ items: Record<string, any>[]; lastKey?: Record<string, any> }> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :evt)',
      ExpressionAttributeValues: { ':pk': `PAIR#${loUserId}#${hiUserId}`, ':evt': 'EVT#' },
      ScanIndexForward: false, // 최신순
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** 특정 상호작용 원장 1건 (실콘텐츠 참조 해석용) */
export async function getLedgerItem(
  loUserId: string,
  hiUserId: string,
  occurredAt: string,
  interactionId: string,
): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: `PAIR#${loUserId}#${hiUserId}`, sk: `EVT#${occurredAt}#${interactionId}` },
    }),
  );
  return res.Item ?? null;
}

/** 내 친구 엣지 목록 (status 필터는 호출부) */
export async function listFriendEdges(userId: string, limit = 200): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :fr)',
      ExpressionAttributeValues: { ':pk': userPk(userId), ':fr': 'FRIEND#' },
      Limit: limit,
    }),
  );
  return res.Items ?? [];
}
