import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * graph 테이블 — 자유글(개인 포스트)·저장 게시물 (이전 가이드 §3 graph).
 *  - 자유글: pk=`USER#<userId>`, sk=`PP#<ISO ts>#<postId>` (sk 역순 = 최신순)
 *  - 저장:   pk=`USER#<userId>`, sk=`SAVE#<plazaPostId>`
 */
const TABLE = 'GRAPH_TABLE';

export interface PersonalPostRecord extends Record<string, unknown> {
  sk: string;
  postId: string;
  userId: string;
  content: string;
  imageKeys: string[];
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedPostRecord extends Record<string, unknown> {
  saveId: string;
  userId: string;
  plazaPostId: string;
  savedAt: string;
  postSnapshot?: Record<string, unknown> | null;
}

// ── 자유글 (PP) ──────────────────────────────────────────────────────────

export async function putPersonalPost(
  userId: string,
  post: { postId: string; content: string; imageKeys: string[]; visibility: string; createdAt: string },
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `USER#${userId}`,
        sk: `PP#${post.createdAt}#${post.postId}`,
        userId,
        postId: post.postId,
        content: post.content,
        imageKeys: post.imageKeys,
        visibility: post.visibility,
        createdAt: post.createdAt,
        updatedAt: post.createdAt,
      },
    }),
  );
}

export async function listPersonalPosts(
  userId: string,
  limit: number,
  exclusiveStartKey?: Record<string, unknown>,
): Promise<{ items: PersonalPostRecord[]; lastKey?: Record<string, unknown> }> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'PP#' },
      ScanIndexForward: false, // 최신순
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: (res.Items ?? []) as PersonalPostRecord[], lastKey: res.LastEvaluatedKey };
}

/** postId(uuid)로 본인 파티션 내 검색 — sk에 작성시각이 들어가므로 프리픽스 Query 후 필터 */
export async function findPersonalPost(
  userId: string,
  postId: string,
): Promise<PersonalPostRecord | undefined> {
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        FilterExpression: 'postId = :pid',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'PP#',
          ':pid': postId,
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    const found = res.Items?.[0];
    if (found) return found as PersonalPostRecord;
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return undefined;
}

export async function updatePersonalPost(
  userId: string,
  sk: string,
  updates: { content?: string; imageKeys?: string[]; visibility?: string },
  nowIso: string,
): Promise<void> {
  const parts: string[] = ['updatedAt = :now'];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':now': nowIso };

  if (updates.content !== undefined) {
    parts.push('#c = :content');
    names['#c'] = 'content';
    values[':content'] = updates.content;
  }
  if (updates.imageKeys !== undefined) {
    parts.push('imageKeys = :keys');
    values[':keys'] = updates.imageKeys;
  }
  if (updates.visibility !== undefined) {
    parts.push('visibility = :vis');
    values[':vis'] = updates.visibility;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${userId}`, sk },
      UpdateExpression: `SET ${parts.join(', ')}`,
      ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
      ExpressionAttributeValues: values,
    }),
  );
}

export async function deletePersonalPost(userId: string, sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: `USER#${userId}`, sk } }),
  );
}

// ── 저장 게시물 (SAVE) ────────────────────────────────────────────────────

export async function getSavedPost(
  userId: string,
  plazaPostId: string,
): Promise<SavedPostRecord | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${userId}`, sk: `SAVE#${plazaPostId}` },
    }),
  );
  return res.Item as SavedPostRecord | undefined;
}

export async function putSavedPost(
  userId: string,
  save: { saveId: string; plazaPostId: string; savedAt: string },
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `USER#${userId}`,
        sk: `SAVE#${save.plazaPostId}`,
        userId,
        saveId: save.saveId,
        plazaPostId: save.plazaPostId,
        savedAt: save.savedAt,
      },
    }),
  );
}

export async function deleteSavedPost(userId: string, plazaPostId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${userId}`, sk: `SAVE#${plazaPostId}` },
    }),
  );
}

export async function listSavedPosts(
  userId: string,
  limit: number,
  exclusiveStartKey?: Record<string, unknown>,
): Promise<{ items: SavedPostRecord[]; lastKey?: Record<string, unknown> }> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'SAVE#' },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: (res.Items ?? []) as SavedPostRecord[], lastKey: res.LastEvaluatedKey };
}
