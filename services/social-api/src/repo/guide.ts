/**
 * social 테이블 — 챌린지 가이드 게시판 (리더/매니저 작성, 글별 댓글, 공지 고정, 읽음 추적).
 *  글      pk=`GUIDE#<challengeId>`   sk=`POST#<createdAt>#<postId>`
 *  읽음    pk=`GUIDE#<challengeId>`   sk=`READ#<userId>`      (lastReadAt — 안읽음 점 표시용)
 *  댓글    pk=`GUIDEPOST#<postId>`    sk=`CMT#<createdAt>#<commentId>`
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE } from './shared';

const guidePk = (challengeId: string) => `GUIDE#${challengeId}`;
const guidePostPk = (postId: string) => `GUIDEPOST#${postId}`;
export const guidePostSk = (createdAt: string, postId: string) => `POST#${createdAt}#${postId}`;
export const guideCommentSk = (createdAt: string, commentId: string) => `CMT#${createdAt}#${commentId}`;

// ── 글 ────────────────────────────────────────────────────────────────────

export async function putGuidePost(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

/** 글 목록 — 최신순, 최대 100 (핀 정렬은 라우트에서) */
export async function listGuidePosts(challengeId: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :post)',
      ExpressionAttributeValues: { ':pk': guidePk(challengeId), ':post': 'POST#' },
      ScanIndexForward: false,
      Limit: 100,
    }),
  );
  return res.Items ?? [];
}

export async function findGuidePostById(
  challengeId: string,
  postId: string,
): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :post)',
      FilterExpression: 'postId = :pid',
      ExpressionAttributeValues: { ':pk': guidePk(challengeId), ':post': 'POST#', ':pid': postId },
    }),
  );
  return (res.Items ?? [])[0] ?? null;
}

export async function deleteGuidePost(challengeId: string, sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: guidePk(challengeId), sk } }),
  );
}

export async function setGuidePostPinned(
  challengeId: string,
  sk: string,
  pinned: boolean,
  nowIso: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: guidePk(challengeId), sk },
      UpdateExpression: pinned
        ? 'SET pinned = :t, pinnedAt = :now'
        : 'SET pinned = :t REMOVE pinnedAt',
      ExpressionAttributeValues: pinned ? { ':t': true, ':now': nowIso } : { ':t': false },
    }),
  );
}

/** 댓글 수 증감 — 글 아이템의 commentCount ADD */
export async function addGuidePostCommentCount(
  challengeId: string,
  sk: string,
  delta: number,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: guidePk(challengeId), sk },
      UpdateExpression: 'ADD commentCount :d',
      ExpressionAttributeValues: { ':d': delta },
    }),
  );
}

// ── 읽음 추적 ─────────────────────────────────────────────────────────────

export async function getGuideRead(
  challengeId: string,
  userId: string,
): Promise<string | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: guidePk(challengeId), sk: `READ#${userId}` },
    }),
  );
  return (res.Item?.lastReadAt as string) ?? null;
}

export async function putGuideRead(
  challengeId: string,
  userId: string,
  nowIso: string,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: { pk: guidePk(challengeId), sk: `READ#${userId}`, userId, lastReadAt: nowIso },
    }),
  );
}

// ── 글별 댓글 ─────────────────────────────────────────────────────────────

export async function putGuideComment(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

/** 댓글 목록 — 오래된 순, 최대 100 */
export async function listGuideComments(postId: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :cmt)',
      ExpressionAttributeValues: { ':pk': guidePostPk(postId), ':cmt': 'CMT#' },
      ScanIndexForward: true,
      Limit: 100,
    }),
  );
  return res.Items ?? [];
}

export async function findGuideCommentById(
  postId: string,
  commentId: string,
): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :cmt)',
      FilterExpression: 'commentId = :cid',
      ExpressionAttributeValues: { ':pk': guidePostPk(postId), ':cmt': 'CMT#', ':cid': commentId },
    }),
  );
  return (res.Items ?? [])[0] ?? null;
}

export async function deleteGuideComment(postId: string, sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: guidePostPk(postId), sk } }),
  );
}
