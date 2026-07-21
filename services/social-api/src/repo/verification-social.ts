/**
 * social 테이블 — 인증 카드 상호작용 (이전 가이드 §3 social).
 *  댓글   pk=`VER#<verificationId>` sk=`CMT#<createdAt>#<commentId>`
 *  리액션 pk=`VER#<verificationId>` sk=`RCT#<userId>#<emoji>`
 *         (가이드 기본형 RCT#<userId>에서 emoji 세그먼트 확장 — 레거시가 유저당
 *          이모지 여러 개를 허용하므로 [vid+user+emoji] 유니크 승계, PORTING.md 참조)
 */
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { verificationPk, TABLE } from './shared';

export const verCommentSk = (createdAt: string, commentId: string) => `CMT#${createdAt}#${commentId}`;

export async function putVerificationComment(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

/** 댓글 목록 — 오래된 순, 최대 50 (레거시 승계) */
export async function listVerificationComments(verificationId: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :cmt)',
      ExpressionAttributeValues: { ':pk': verificationPk(verificationId), ':cmt': 'CMT#' },
      ScanIndexForward: true,
      Limit: 50,
    }),
  );
  return res.Items ?? [];
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
