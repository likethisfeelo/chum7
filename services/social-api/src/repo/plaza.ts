/**
 * social 테이블 — 마당(plaza) 게시물·댓글·리액션·추천 억제.
 * 키 설계 (이전 가이드 §3 social):
 *  게시물   pk=`POST#<plazaPostId>` sk=`META`
 *           gsi1pk=`FEED#<postType>` gsi1sk=`<createdAt>` (피드; FEED#ALL 통합 파티션 대신
 *           타입별 파티션 + 병렬 Query — 레거시 postType-createdAt-index 동작 승계)
 *           gsi2pk=`TAG#<hashtag>` gsi2sk=`<createdAt>` (태그 피드)
 *  댓글     pk=`POST#<id>` sk=`CMT#<createdAt>#<commentId>`
 *  리액션   pk=`POST#<id>` sk=`RCT#<userId>`
 *  추천 억제 pk=`REC#<userId>` sk=`DIS#<challengeId>` (TTL expiresAt)
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { postPk, recommendationPk, TABLE } from './shared';

export function feedGsi1Pk(postType: string): string {
  return `FEED#${postType}`;
}

export function buildPostKeys(input: {
  plazaPostId: string;
  postType: string;
  createdAt: string;
  hashtag?: string | null;
}) {
  return {
    pk: postPk(input.plazaPostId),
    sk: 'META',
    gsi1pk: feedGsi1Pk(input.postType),
    gsi1sk: input.createdAt,
    ...(input.hashtag ? { gsi2pk: `TAG#${input.hashtag}`, gsi2sk: input.createdAt } : {}),
  };
}

export async function putPost(item: Record<string, any>): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: item,
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );
}

export async function getPost(plazaPostId: string): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: postPk(plazaPostId), sk: 'META' } }),
  );
  return res.Item ?? null;
}

export interface FeedPageResult {
  items: Record<string, any>[];
  lastKey?: Record<string, any>;
}

/** 타입별 피드 페이지 — gsi1 Query 최신순. hashtag는 레거시처럼 FilterExpression (courtyard 한정은 호출부) */
export async function queryFeedByPostType(
  postType: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
  hashtag?: string,
): Promise<FeedPageResult> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :feed',
      ExpressionAttributeValues: {
        ':feed': feedGsi1Pk(postType),
        ...(hashtag ? { ':hashtag': hashtag } : {}),
      },
      ...(hashtag ? { FilterExpression: 'hashtag = :hashtag' } : {}),
      ScanIndexForward: false,
      ExclusiveStartKey: exclusiveStartKey,
      Limit: limit,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

// ── 댓글 ───────────────────────────────────────────────────────────────

export const commentSk = (createdAt: string, commentId: string) => `CMT#${createdAt}#${commentId}`;

export async function putPostComment(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

export async function listPostComments(
  plazaPostId: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
): Promise<FeedPageResult> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :cmt)',
      ExpressionAttributeValues: { ':pk': postPk(plazaPostId), ':cmt': 'CMT#' },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** 게시물 META 카운터 증분 (commentCount 등) — 레거시 if_not_exists 패턴 승계 */
export async function incrementPostCounter(
  plazaPostId: string,
  attr: 'commentCount' | 'bookmarkCount',
  delta: number,
  now: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: postPk(plazaPostId), sk: 'META' },
      UpdateExpression: `SET ${attr} = if_not_exists(${attr}, :zero) + :inc, updatedAt = :updatedAt`,
      ExpressionAttributeValues: { ':inc': delta, ':zero': 0, ':updatedAt': now },
    }),
  );
}

// ── 리액션 (RCT#<userId>) ──────────────────────────────────────────────

export async function putReaction(
  plazaPostId: string,
  userId: string,
  reactionType: string,
  challengeId: string | null,
  now: string,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: postPk(plazaPostId),
        sk: `RCT#${userId}`,
        reactionId: `${plazaPostId}#${userId}`,
        plazaPostId,
        userId,
        reactionType,
        challengeId,
        createdAt: now,
      },
    }),
  );
}

export async function deleteReaction(plazaPostId: string, userId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: postPk(plazaPostId), sk: `RCT#${userId}` } }),
  );
}

/** 리액션 수 재계산 (레거시 COUNT Query 승계) */
export async function countReactions(plazaPostId: string): Promise<number> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :rct)',
      ExpressionAttributeValues: { ':pk': postPk(plazaPostId), ':rct': 'RCT#' },
      Select: 'COUNT',
    }),
  );
  return res.Count ?? 0;
}

export async function setPostLikeCount(plazaPostId: string, likeCount: number, now: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: postPk(plazaPostId), sk: 'META' },
      UpdateExpression: 'SET likeCount = :likeCount, updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':likeCount': likeCount, ':updatedAt': now },
    }),
  );
}

// ── 추천 억제 (dismiss, TTL) ───────────────────────────────────────────

export async function putRecommendationDismissal(input: {
  userId: string;
  recommendationId: string;
  recommendedChallengeId: string | null;
  now: Date;
  suppressUntil: Date;
}): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: recommendationPk(input.userId),
        sk: `DIS#${input.recommendedChallengeId ?? input.recommendationId}`,
        recommendationId: input.recommendationId,
        userId: input.userId,
        recommendedChallengeId: input.recommendedChallengeId,
        isDismissed: true,
        createdAt: input.now.toISOString(),
        dismissAt: input.now.toISOString(),
        suppressUntil: input.suppressUntil.toISOString(),
        // TTL 속성 (레거시 expiresAtTimestamp 승계)
        expiresAtTimestamp: Math.floor(input.suppressUntil.getTime() / 1000),
      },
    }),
  );
}

/** 억제 중(suppressUntil 미래)인 challengeId 집합 */
export async function listSuppressedChallengeIds(userId: string, nowMs: number): Promise<Set<string>> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :dis)',
      ExpressionAttributeValues: { ':pk': recommendationPk(userId), ':dis': 'DIS#' },
      Limit: 100,
    }),
  );
  const suppressed = new Set<string>();
  for (const item of res.Items ?? []) {
    if (!item.isDismissed || !item.recommendedChallengeId) continue;
    const until = item.suppressUntil ? new Date(item.suppressUntil).getTime() : 0;
    if (until > nowMs) suppressed.add(item.recommendedChallengeId);
  }
  return suppressed;
}
