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
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { postPk, recommendationPk, TABLE } from './shared';

/** 운영자 게시물 관리 인덱스 파티션 — 저비용 목록 조회용(피드 스캔 회피) */
export const ADMIN_POSTS_PK = 'ADMINPOSTS';
const adminPostSk = (plazaPostId: string) => `POST#${plazaPostId}`;

/** 운영자 마당글 게시/삭제 감사 로그 — 누가 올리고 누가 지웠는지 */
const PLAZA_ADMIN_LOG_PK = 'PLAZAADMINLOG';
export async function putPlazaAdminLog(input: {
  action: 'create' | 'delete';
  actorId: string;
  plazaPostId: string;
  authorId?: string | null;
  at: string;
  contentPreview?: string | null;
}): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: PLAZA_ADMIN_LOG_PK,
        sk: `${input.at}#${input.plazaPostId}#${input.action}`,
        action: input.action,
        actorId: input.actorId,
        plazaPostId: input.plazaPostId,
        authorId: input.authorId ?? null,
        contentPreview: input.contentPreview ?? null,
        at: input.at,
      },
    }),
  );
}
export async function listPlazaAdminLog(limit = 100): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': PLAZA_ADMIN_LOG_PK },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return res.Items ?? [];
}

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

/** 게시물 노출 토글 — isActive=false 로 내리면 피드/상세에서 제외 (운영자 게시물 회수용) */
export async function setPostActive(plazaPostId: string, isActive: boolean): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: postPk(plazaPostId), sk: 'META' },
      UpdateExpression: 'SET isActive = :active',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':active': isActive },
    }),
  );
}

// ── 운영자 게시물 관리 인덱스 ────────────────────────────────────────────
// pk=ADMINPOSTS, sk=POST#<plazaPostId> 포인터 아이템으로 목록/상태/삭제를 저비용 처리.

/** 운영자 게시물 포인터 upsert (작성 시) */
export async function putAdminPostIndex(input: {
  plazaPostId: string;
  createdAt: string;
  content?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  challengeCategory?: string | null;
  hashtag?: string | null;
  isActive: boolean;
  authorId?: string | null;
}): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: ADMIN_POSTS_PK,
        sk: adminPostSk(input.plazaPostId),
        plazaPostId: input.plazaPostId,
        createdAt: input.createdAt,
        content: input.content ?? null,
        imageUrl: input.imageUrl ?? null,
        imageUrls: input.imageUrls ?? null,
        challengeCategory: input.challengeCategory ?? null,
        hashtag: input.hashtag ?? null,
        isActive: input.isActive,
        authorId: input.authorId ?? null,
      },
    }),
  );
}

/** 운영자 게시물 목록 — 포인터 파티션 Query 후 createdAt 최신순 정렬 */
export async function listAdminPostIndex(limit = 200): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': ADMIN_POSTS_PK },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey && items.length < limit);
  return items
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .slice(0, limit);
}

/** 포인터 isActive 동기화 */
export async function setAdminPostIndexActive(plazaPostId: string, isActive: boolean): Promise<void> {
  await docClient
    .send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: ADMIN_POSTS_PK, sk: adminPostSk(plazaPostId) },
        UpdateExpression: 'SET isActive = :active',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: { ':active': isActive },
      }),
    )
    .catch((err: any) => {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
    });
}

/** 포인터 삭제 */
export async function deleteAdminPostIndex(plazaPostId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: ADMIN_POSTS_PK, sk: adminPostSk(plazaPostId) },
    }),
  );
}

/** 게시물 완전 삭제 — pk=POST#<id> 하위(META·댓글·리액션·익명순번) 전량 BatchDelete */
export async function deletePostCompletely(plazaPostId: string): Promise<void> {
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': postPk(plazaPostId) },
        ProjectionExpression: 'pk, sk',
        ExclusiveStartKey: lastKey,
      }),
    );
    const rows = res.Items ?? [];
    for (let i = 0; i < rows.length; i += 25) {
      const chunk = rows.slice(i, i + 25);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName(TABLE)]: chunk.map((it) => ({
              DeleteRequest: { Key: { pk: it.pk, sk: it.sk } },
            })),
          },
        }),
      );
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
}

export interface FeedPageResult {
  items: Record<string, any>[];
  lastKey?: Record<string, any>;
}

/**
 * 타입별 피드 페이지 — gsi1 Query 최신순.
 * hashtag / challengeCategory 는 gsi1 위에 FilterExpression 으로 적용 (별도 인덱스 없이).
 * hashtag 와 category 는 서로 독립 — 둘 다 주면 AND 로 결합.
 */
export async function queryFeedByPostType(
  postType: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
  filters?: { hashtag?: string; category?: string },
): Promise<FeedPageResult> {
  const hashtag = filters?.hashtag;
  const category = filters?.category;

  const conditions: string[] = [];
  const values: Record<string, any> = { ':feed': feedGsi1Pk(postType) };
  if (hashtag) {
    conditions.push('hashtag = :hashtag');
    values[':hashtag'] = hashtag;
  }
  if (category) {
    conditions.push('challengeCategory = :category');
    values[':category'] = category;
  }

  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :feed',
      ExpressionAttributeValues: values,
      ...(conditions.length ? { FilterExpression: conditions.join(' AND ') } : {}),
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

/** 댓글 삭제 — 본인(userId 일치)만. 조건 미충족/없음이면 false. */
export async function deletePostComment(
  plazaPostId: string,
  sk: string,
  userId: string,
): Promise<boolean> {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: tableName(TABLE),
        Key: { pk: postPk(plazaPostId), sk },
        ConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
      }),
    );
    return true;
  } catch {
    return false; // ConditionalCheckFailed = 본인 아님 또는 존재하지 않음
  }
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
      // 관리자 숨김 댓글 제외
      FilterExpression: 'attribute_not_exists(hiddenByAdmin) OR hiddenByAdmin = :false',
      ExpressionAttributeValues: { ':pk': postPk(plazaPostId), ':cmt': 'CMT#', ':false': false },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** 관리자 댓글 숨김/복원 — hiddenByAdmin 플래그 */
export async function setCommentHidden(
  plazaPostId: string,
  commentSkValue: string,
  hidden: boolean,
): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: postPk(plazaPostId), sk: commentSkValue },
        UpdateExpression: 'SET hiddenByAdmin = :h, hiddenAt = :t',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: { ':h': hidden, ':t': new Date().toISOString() },
      }),
    );
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
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

// ── 게시물별 익명 순번 (아무개N) ────────────────────────────────────────
// pk=POST#<id>, sk=ANONNUM#<userId> → { anonymousNumber }  (사용자 매핑, 게시물 내 고정)
// pk=POST#<id>, sk=ANONCOUNTER      → { nextNumber }        (원자 증가 카운터)
// 게시물마다 카운터·매핑이 분리되어 사용자 간·게시물 간 연결이 불가능하다.
export const anonNumberSk = (userId: string) => `ANONNUM#${userId}`;
const ANON_COUNTER_SK = 'ANONCOUNTER';

export async function getOrAssignAnonNumber(
  plazaPostId: string,
  userId: string,
  now: string,
): Promise<number> {
  const pk = postPk(plazaPostId);

  // 1) 이미 배정된 번호가 있으면 그대로 (게시물 내 고정)
  const existing = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk, sk: anonNumberSk(userId) } }),
  );
  if (existing.Item?.anonymousNumber) return Number(existing.Item.anonymousNumber);

  // 2) 게시물 카운터 원자 증가 (최초 → 1)
  const counter = await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk, sk: ANON_COUNTER_SK },
      UpdateExpression: 'SET nextNumber = if_not_exists(nextNumber, :zero) + :one',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  const assigned = Number(counter.Attributes?.nextNumber ?? 1);

  // 3) 매핑 조건부 생성 — 동시 중복이면 재조회 값 사용(번호 건너뜀은 무해)
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(TABLE),
        Item: { pk, sk: anonNumberSk(userId), anonymousNumber: assigned, createdAt: now },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    return assigned;
  } catch {
    const re = await docClient.send(
      new GetCommand({ TableName: tableName(TABLE), Key: { pk, sk: anonNumberSk(userId) } }),
    );
    return Number(re.Item?.anonymousNumber ?? assigned);
  }
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
