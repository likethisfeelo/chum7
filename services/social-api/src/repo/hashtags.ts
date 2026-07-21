/**
 * social 테이블 — 해시태그 레지스트리·팔로우 (이전 가이드 §3 social).
 *  레지스트리 META  pk=`TAG#<tag>` sk=`META`
 *                   gsi1pk=`TAGREG` gsi1sk=`<registeredAt>` (최신 태그 목록 — 레거시 Scan 재작성)
 *  팔로우           pk=`TAG#<tag>` sk=`FOLLOW#<userId>`
 *                   gsi1pk=`TAGUSER#<userId>` gsi1sk=`<tag>` (내 팔로우 태그)
 *  태그 게시물 피드 = 게시물 gsi2 (`TAG#<tag>`) Query — repo/plaza 게시물 아이템 참조.
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { tagPk, TABLE } from './shared';

export const TAG_REGISTRY_GSI1PK = 'TAGREG';

/** 최초 등록자 기록 (이미 있으면 무시) + postCount 증분 — 레거시 verification/submit 승계 */
export async function registerHashtag(input: {
  hashtag: string;
  creatorUserId: string;
  creatorAnimalIcon: string;
  now: string;
}): Promise<void> {
  await docClient
    .send(
      new PutCommand({
        TableName: tableName(TABLE),
        Item: {
          pk: tagPk(input.hashtag),
          sk: 'META',
          gsi1pk: TAG_REGISTRY_GSI1PK,
          gsi1sk: input.now,
          hashtag: input.hashtag,
          creatorUserId: input.creatorUserId,
          creatorAnimalIcon: input.creatorAnimalIcon,
          registeredAt: input.now,
          creatorPublic: true,
          postCount: 0,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    )
    .catch((err: any) => {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
    });

  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: tagPk(input.hashtag), sk: 'META' },
      UpdateExpression: 'SET postCount = if_not_exists(postCount, :zero) + :inc',
      ExpressionAttributeValues: { ':inc': 1, ':zero': 0 },
    }),
  );
}

export async function getHashtag(tag: string): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: tagPk(tag), sk: 'META' } }),
  );
  return res.Item ?? null;
}

/** 최신 태그 목록 — gsi1 `TAGREG` 파티션 Query (레거시 Scan → 풀스캔 금지 재작성) */
export async function listLatestHashtags(limit: number): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :reg',
      ExpressionAttributeValues: { ':reg': TAG_REGISTRY_GSI1PK },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return res.Items ?? [];
}

export async function countFollowers(tag: string): Promise<number> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :follow)',
      ExpressionAttributeValues: { ':pk': tagPk(tag), ':follow': 'FOLLOW#' },
      Select: 'COUNT',
    }),
  );
  return res.Count ?? 0;
}

export async function getFollow(tag: string, userId: string): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: tagPk(tag), sk: `FOLLOW#${userId}` } }),
  );
  return res.Item ?? null;
}

export async function putFollow(input: {
  tag: string;
  userId: string;
  followId: string;
  followedAt: string;
}): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: tagPk(input.tag),
        sk: `FOLLOW#${input.userId}`,
        gsi1pk: `TAGUSER#${input.userId}`,
        gsi1sk: input.tag,
        followId: input.followId,
        userId: input.userId,
        hashtag: input.tag,
        followedAt: input.followedAt,
      },
    }),
  );
}

export async function deleteFollow(tag: string, userId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: tagPk(tag), sk: `FOLLOW#${userId}` } }),
  );
}

export interface TagPostsResult {
  items: Record<string, any>[];
  lastKey?: Record<string, any>;
}

/** 태그 게시물 피드 — 게시물 gsi2 `TAG#<tag>` Query 최신순 */
export async function listTagPosts(
  tag: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
): Promise<TagPostsResult> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi2',
      KeyConditionExpression: 'gsi2pk = :tag',
      ExpressionAttributeValues: { ':tag': `TAG#${tag}` },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}
