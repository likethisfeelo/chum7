/**
 * social 테이블 — 인증 카드 상호작용 (이전 가이드 §3 social).
 *  댓글   pk=`VER#<verificationId>` sk=`CMT#<createdAt>#<commentId>`
 *  리액션 pk=`VER#<verificationId>` sk=`RCT#<userId>#<emoji>`
 *         (가이드 기본형 RCT#<userId>에서 emoji 세그먼트 확장 — 레거시가 유저당
 *          이모지 여러 개를 허용하므로 [vid+user+emoji] 유니크 승계, PORTING.md 참조)
 */
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { verificationPk, TABLE } from './shared';

export const verCommentSk = (createdAt: string, commentId: string) => `CMT#${createdAt}#${commentId}`;

export async function putVerificationComment(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

/** 댓글 목록 — 오래된 순, 최대 200 (대댓글 트리 포함 — 프론트가 parentCommentId로 트리 구성) */
export async function listVerificationComments(verificationId: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :cmt)',
      ExpressionAttributeValues: { ':pk': verificationPk(verificationId), ':cmt': 'CMT#' },
      ScanIndexForward: true,
      Limit: 200,
    }),
  );
  return res.Items ?? [];
}

/** 댓글 소프트 삭제 — 대댓글이 달린 부모는 스레드 유지를 위해 내용만 지운다 */
export async function softDeleteVerificationComment(verificationId: string, sk: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: verificationPk(verificationId), sk },
      UpdateExpression: 'SET deleted = :t, content = :msg',
      ExpressionAttributeValues: { ':t': true, ':msg': '삭제된 댓글입니다' },
    }),
  );
}

export async function findVerificationCommentById(
  verificationId: string,
  commentId: string,
): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :cmt)',
      FilterExpression: 'commentId = :cid',
      ExpressionAttributeValues: {
        ':pk': verificationPk(verificationId),
        ':cmt': 'CMT#',
        ':cid': commentId,
      },
    }),
  );
  return (res.Items ?? [])[0] ?? null;
}

export async function deleteVerificationComment(verificationId: string, sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: verificationPk(verificationId), sk } }),
  );
}

// ── 리액션 ─────────────────────────────────────────────────────────────

const reactionSk = (userId: string, emoji: string) => `RCT#${userId}#${emoji}`;

export async function putVerificationReaction(input: {
  verificationId: string;
  challengeId: string;
  userId: string;
  emoji: string;
  now: string;
}): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: verificationPk(input.verificationId),
        sk: reactionSk(input.userId, input.emoji),
        reactionId: `${input.verificationId}#${input.userId}#${input.emoji}`,
        verificationId: input.verificationId,
        challengeId: input.challengeId,
        userId: input.userId,
        emoji: input.emoji,
        createdAt: input.now,
      },
    }),
  );
}

export async function deleteVerificationReaction(
  verificationId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: verificationPk(verificationId), sk: reactionSk(userId, emoji) },
    }),
  );
}

export async function listVerificationReactions(verificationId: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :rct)',
      ExpressionAttributeValues: { ':pk': verificationPk(verificationId), ':rct': 'RCT#' },
    }),
  );
  return res.Items ?? [];
}

// ── 댓글 리액션 — sk=`CRT#<commentId>#<userId>#<emoji>` ([댓글+유저+이모지] 유니크) ──

const commentReactionSk = (commentId: string, userId: string, emoji: string) =>
  `CRT#${commentId}#${userId}#${emoji}`;

export async function getCommentReaction(
  verificationId: string,
  commentId: string,
  userId: string,
  emoji: string,
): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: verificationPk(verificationId), sk: commentReactionSk(commentId, userId, emoji) },
    }),
  );
  return res.Item;
}

export async function putCommentReaction(input: {
  verificationId: string;
  commentId: string;
  challengeId: string;
  userId: string;
  emoji: string;
  now: string;
}): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: verificationPk(input.verificationId),
        sk: commentReactionSk(input.commentId, input.userId, input.emoji),
        commentId: input.commentId,
        verificationId: input.verificationId,
        challengeId: input.challengeId,
        userId: input.userId,
        emoji: input.emoji,
        createdAt: input.now,
      },
    }),
  );
}

export async function deleteCommentReaction(
  verificationId: string,
  commentId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: verificationPk(verificationId), sk: commentReactionSk(commentId, userId, emoji) },
    }),
  );
}

/** 이 인증의 댓글 리액션 전체 — 한 번에 조회해 프론트가 commentId별로 묶는다 */
export async function listCommentReactionsByVerification(
  verificationId: string,
): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :crt)',
        ExpressionAttributeValues: { ':pk': verificationPk(verificationId), ':crt': 'CRT#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
