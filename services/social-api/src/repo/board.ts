/**
 * social 테이블 — 챌린지보드 (이전 가이드 §3 social).
 *  보드 메타   pk=`BOARD#<challengeId>` sk=`META` (editors/isPublic/updatedAt/updatedBy/leaderId)
 *  보드 블록   pk=`BOARD#<challengeId>` sk=`BLOCK#<order 4자리>` (블록 1개 = 아이템 1개)
 *  프리뷰      pk=`BOARD#<challengeId>` sk=`PREVIEW` (blocks 배열 내장 — 단일 문서)
 *  댓글        pk=`BOARD#<challengeId>` sk=`CMT#<createdAt>#<commentId>`
 *  리더 DM     pk=`BOARD#<challengeId>` sk=`DM#<participantId>`
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
import { boardPk, TABLE } from './shared';

const blockSk = (order: number) => `BLOCK#${String(order).padStart(4, '0')}`;

export interface BoardDoc {
  challengeId: string;
  blocks: any[];
  editors: string[];
  isPublic: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** 보드 조회 — META + BLOCK# 파티션 Query 재조립 (레거시 단일 문서 바디 유지) */
export async function getBoard(challengeId: string): Promise<BoardDoc | null> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': boardPk(challengeId) },
    }),
  );
  const items = res.Items ?? [];
  const meta = items.find((i) => i.sk === 'META');
  const blocks = items
    .filter((i) => typeof i.sk === 'string' && i.sk.startsWith('BLOCK#'))
    .sort((a, b) => String(a.sk).localeCompare(String(b.sk)))
    .map((i) => i.block);
  if (!meta && blocks.length === 0) return null;
  return {
    challengeId,
    blocks,
    editors: meta?.editors ?? [],
    isPublic: meta?.isPublic ?? false,
    updatedAt: meta?.updatedAt ?? null,
    updatedBy: meta?.updatedBy ?? null,
  };
}

/** 보드 전체 교체 — META + 블록 아이템 batch 재기록, 남는 기존 블록 삭제 */
export async function putBoard(input: {
  challengeId: string;
  blocks: any[];
  editors: any[];
  updatedAt: string;
  updatedBy: string;
}): Promise<void> {
  const pk = boardPk(input.challengeId);
  const existing = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :block)',
      ExpressionAttributeValues: { ':pk': pk, ':block': 'BLOCK#' },
      ProjectionExpression: 'pk, sk',
    }),
  );
  const staleKeys = (existing.Items ?? [])
    .filter((i) => String(i.sk) >= blockSk(input.blocks.length))
    .map((i) => ({ pk: i.pk, sk: i.sk }));

  const writes: any[] = [
    {
      PutRequest: {
        Item: {
          pk,
          sk: 'META',
          challengeId: input.challengeId,
          editors: input.editors,
          isPublic: false,
          updatedAt: input.updatedAt,
          updatedBy: input.updatedBy,
        },
      },
    },
    ...input.blocks.map((block, order) => ({
      PutRequest: { Item: { pk, sk: blockSk(order), challengeId: input.challengeId, block } },
    })),
    ...staleKeys.map((key) => ({ DeleteRequest: { Key: key } })),
  ];

  for (let i = 0; i < writes.length; i += 25) {
    await docClient.send(
      new BatchWriteCommand({ RequestItems: { [tableName(TABLE)]: writes.slice(i, i + 25) } }),
    );
  }
}

// ── 프리뷰 (단일 문서) ─────────────────────────────────────────────────

export async function getPreview(challengeId: string): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: boardPk(challengeId), sk: 'PREVIEW' } }),
  );
  return res.Item ?? null;
}

export async function putPreview(input: {
  challengeId: string;
  blocks: any[];
  updatedAt: string;
  updatedBy: string;
}): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: boardPk(input.challengeId),
        sk: 'PREVIEW',
        challengeId: input.challengeId,
        blocks: input.blocks,
        updatedAt: input.updatedAt,
        updatedBy: input.updatedBy,
      },
    }),
  );
}

// ── 댓글 ───────────────────────────────────────────────────────────────

export const boardCommentSk = (createdAt: string, commentId: string) => `CMT#${createdAt}#${commentId}`;

export async function putBoardComment(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

export interface BoardCommentsResult {
  items: Record<string, any>[];
  lastKey?: Record<string, any>;
}

export async function listBoardComments(
  challengeId: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
): Promise<BoardCommentsResult> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :cmt)',
      ExpressionAttributeValues: { ':pk': boardPk(challengeId), ':cmt': 'CMT#' },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** commentId로 댓글 아이템 검색 (파티션 Query + 필터 — 파티션은 챌린지 스코프로 유한) */
export async function findBoardCommentById(
  challengeId: string,
  commentId: string,
): Promise<Record<string, any> | null> {
  let exclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :cmt)',
        FilterExpression: 'commentId = :cid',
        ExpressionAttributeValues: {
          ':pk': boardPk(challengeId),
          ':cmt': 'CMT#',
          ':cid': commentId,
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

/** 댓글 이모지 리액션 — 레거시 문자열 Set ADD/DELETE 승계 */
export async function updateBoardCommentReaction(
  challengeId: string,
  commentSk: string,
  attrName: string,
  action: 'add' | 'remove',
  userId: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: boardPk(challengeId), sk: commentSk },
      UpdateExpression: action === 'add' ? 'ADD #attr :val' : 'DELETE #attr :val',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeNames: { '#attr': attrName },
      ExpressionAttributeValues: { ':val': new Set([userId]) },
    }),
  );
}

export async function markCommentQuoted(challengeId: string, commentSk: string, now: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: boardPk(challengeId), sk: commentSk },
      UpdateExpression: 'SET isQuoted = :true, quotedAt = :now',
      ExpressionAttributeValues: { ':true': true, ':now': now },
    }),
  );
}

// ── 리더 DM 스레드 마커 ────────────────────────────────────────────────

export async function getDmThread(challengeId: string, participantId: string) {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: boardPk(challengeId), sk: `DM#${participantId}` } }),
  );
  return res.Item ?? null;
}

export async function putDmThread(item: Record<string, any>): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
}

export async function deleteBoardItem(challengeId: string, sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: boardPk(challengeId), sk } }),
  );
}
