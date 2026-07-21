import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * graph 테이블 — 팔로우/팔로우 요청/차단 (이전 가이드 §3 graph).
 *  - 팔로우:      pk=`USER#<followeeId>`, sk=`FOLLOWER#<followerId>`
 *                 gsi1pk=`FOLLOWING#<followerId>`, gsi1sk=`<createdAt>`
 *  - 팔로우 요청: pk=`USER#<followeeId>`, sk=`FOLLOWREQ#<followerId>`
 *                 gsi1pk=`FOLLOWREQOUT#<followerId>`, gsi1sk=`<createdAt>`
 *  - 차단:        pk=`USER#<blockerId>`, sk=`BLOCK#<blockedId>`
 * 레거시 단일 아이템(status pending/accepted/rejected) → 요청·수락 분리 아이템으로 재설계.
 */
const TABLE = 'GRAPH_TABLE';

export interface FollowRecord extends Record<string, unknown> {
  followerId: string;
  followeeId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BlockRecord extends Record<string, unknown> {
  blockerId: string;
  blockedUserId: string;
  createdAt: string;
}

async function getItem(pk: string, sk: string): Promise<Record<string, unknown> | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk, sk } }),
  );
  return res.Item;
}

/** 파티션 내 sk 프리픽스 전체 조회 (풀스캔 아님 — 파티션 Query) */
export async function listByPrefix(
  pk: string,
  skPrefix: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: { ':pk': pk, ':sk': skPrefix },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ── 팔로우 ────────────────────────────────────────────────────────────────

export async function getFollow(
  followeeId: string,
  followerId: string,
): Promise<FollowRecord | undefined> {
  return (await getItem(`USER#${followeeId}`, `FOLLOWER#${followerId}`)) as
    | FollowRecord
    | undefined;
}

export async function getFollowRequest(
  followeeId: string,
  followerId: string,
): Promise<FollowRecord | undefined> {
  return (await getItem(`USER#${followeeId}`, `FOLLOWREQ#${followerId}`)) as
    | FollowRecord
    | undefined;
}

export async function putFollowRequest(
  followerId: string,
  followeeId: string,
  nowIso: string,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `USER#${followeeId}`,
        sk: `FOLLOWREQ#${followerId}`,
        gsi1pk: `FOLLOWREQOUT#${followerId}`,
        gsi1sk: nowIso,
        followerId,
        followeeId,
        status: 'pending',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    }),
  );
}

export async function deleteFollowRequest(followeeId: string, followerId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${followeeId}`, sk: `FOLLOWREQ#${followerId}` },
    }),
  );
}

export async function putFollow(
  followerId: string,
  followeeId: string,
  nowIso: string,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `USER#${followeeId}`,
        sk: `FOLLOWER#${followerId}`,
        gsi1pk: `FOLLOWING#${followerId}`,
        gsi1sk: nowIso,
        followerId,
        followeeId,
        status: 'accepted',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    }),
  );
}

export async function deleteFollow(followeeId: string, followerId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${followeeId}`, sk: `FOLLOWER#${followerId}` },
    }),
  );
}

export async function listFollowers(followeeId: string): Promise<FollowRecord[]> {
  return (await listByPrefix(`USER#${followeeId}`, 'FOLLOWER#')) as FollowRecord[];
}

export async function listFollowRequests(followeeId: string): Promise<FollowRecord[]> {
  return (await listByPrefix(`USER#${followeeId}`, 'FOLLOWREQ#')) as FollowRecord[];
}

// ── 차단 ─────────────────────────────────────────────────────────────────

export async function isBlocked(blockerId: string, blockedUserId: string): Promise<boolean> {
  return !!(await getItem(`USER#${blockerId}`, `BLOCK#${blockedUserId}`));
}

/** 이미 차단돼 있으면 조용히 무시 (레거시 idempotent 동작) */
export async function putBlockIfAbsent(
  blockerId: string,
  blockedUserId: string,
  nowIso: string,
): Promise<void> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(TABLE),
        Item: {
          pk: `USER#${blockerId}`,
          sk: `BLOCK#${blockedUserId}`,
          blockerId,
          blockedUserId,
          createdAt: nowIso,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
  }
}

export async function deleteBlock(blockerId: string, blockedUserId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${blockerId}`, sk: `BLOCK#${blockedUserId}` },
    }),
  );
}

export async function listBlocked(blockerId: string): Promise<BlockRecord[]> {
  return (await listByPrefix(`USER#${blockerId}`, 'BLOCK#')) as BlockRecord[];
}
