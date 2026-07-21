/**
 * social 테이블 — 불레틴 게시판 (이전 가이드 §3 social).
 *  게시글 pk=`BULL#<challengeId>#<phase>` sk=`POST#<createdAt>#<postId>` (최신순 = sk 역순)
 *  댓글   pk=동일 sk=`PCMT#<postId>#<createdAt>#<commentId>` (오래된 순 = sk 정순)
 *  좋아요 pk=동일 sk=`LIKE#<postId>#<userId>`
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { bulletinPk, TABLE } from './shared';

export const bulletinPostSk = (createdAt: string, postId: string) => `POST#${createdAt}#${postId}`;
export const bulletinCommentSk = (postId: string, createdAt: string, commentId: string) =>
  `PCMT#${postId}#${createdAt}#${commentId}`;
export const bulletinLikeSk = (postId: string, userId: string) => `LIKE#${postId}#${userId}`;

export interface PageResult {
  items: Record<string, any>[];
  lastKey?: Record<string, any>;
}

export async function putBulletinItem(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

/** 게시글 목록 — 최신순 + isDeleted 필터 (레거시 승계) */
export async function listBulletinPosts(
  challengeId: string,
  phase: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
): Promise<PageResult> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :post)',
      FilterExpression: 'isDeleted = :false',
      ExpressionAttributeValues: {
        ':pk': bulletinPk(challengeId, phase),
        ':post': 'POST#',
        ':false': false,
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** postId로 게시글 검색 — sk가 createdAt을 포함하므로 파티션 필터 Query (파티션은 챌린지 스코프) */
export async function findBulletinPostById(
  challengeId: string,
  phase: string,
  postId: string,
): Promise<Record<string, any> | null> {
  let exclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :post)',
        FilterExpression: 'postId = :pid',
        ExpressionAttributeValues: {
          ':pk': bulletinPk(challengeId, phase),
          ':post': 'POST#',
          ':pid': postId,
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    const found = (res.Items ?? [])[0];
    if (found) return found;
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return null;
}

/** 댓글 목록 — 오래된 순 + isDeleted 필터 (레거시 승계) */
export async function listBulletinComments(
  challengeId: string,
  phase: string,
  postId: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
): Promise<PageResult> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :cmt)',
      FilterExpression: 'isDeleted = :false',
      ExpressionAttributeValues: {
        ':pk': bulletinPk(challengeId, phase),
        ':cmt': `PCMT#${postId}#`,
        ':false': false,
      },
      ScanIndexForward: true,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

export async function getBulletinLike(
  challengeId: string,
  phase: string,
  postId: string,
  userId: string,
): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: bulletinPk(challengeId, phase), sk: bulletinLikeSk(postId, userId) },
    }),
  );
  return res.Item ?? null;
}

export async function deleteBulletinLike(
  challengeId: string,
  phase: string,
  postId: string,
  userId: string,
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: bulletinPk(challengeId, phase), sk: bulletinLikeSk(postId, userId) },
    }),
  );
}

/** 게시글 카운터 증감 (likeCount/commentCount) — 감소는 0 하한 조건 (레거시 승계) */
export async function updateBulletinPostCounter(
  challengeId: string,
  phase: string,
  postSk: string,
  attr: 'likeCount' | 'commentCount',
  delta: 1 | -1,
  now: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: bulletinPk(challengeId, phase), sk: postSk },
      UpdateExpression:
        delta > 0
          ? `SET ${attr} = if_not_exists(${attr}, :zero) + :one, updatedAt = :now`
          : `SET ${attr} = if_not_exists(${attr}, :zero) - :one, updatedAt = :now`,
      ...(delta < 0 ? { ConditionExpression: `${attr} > :zero` } : {}),
      ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':now': now },
    }),
  );
}
