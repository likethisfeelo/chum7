import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import {
  COUNT_ATTR,
  InteractionType,
  PairInteraction,
  pairKey,
  RECOMMEND_THRESHOLD,
  scorePair,
  scoreSortKey,
} from '../domain/pairing';

const GRAPH_TABLE = 'GRAPH_TABLE';

/**
 * 이벤트 원장 append — 멱등(같은 interactionId 재수신 시 조건부 put 실패 → false).
 * false면 호출자는 집계 갱신을 건너뛴다(중복 카운트 방지).
 */
export async function appendLedger(x: PairInteraction, occurredAt: string): Promise<boolean> {
  const { lo, hi } = pairKey(x.actorUserId, x.targetUserId);
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(GRAPH_TABLE),
        Item: {
          pk: `PAIR#${lo}#${hi}`,
          sk: `EVT#${occurredAt}#${x.interactionId}`,
          interactionId: x.interactionId,
          actorUserId: x.actorUserId,
          targetUserId: x.targetUserId,
          interactionType: x.interactionType,
          contextType: x.contextType,
          contextId: x.contextId,
          sourceEntityType: x.sourceEntityType,
          sourceEntityId: x.sourceEntityId,
          visibilityState: 'active',
          archiveEligible: true,
          occurredAt,
          // 원본 삭제 시 역조회용 인덱스 (content.deleted → 이 항목을 deleted 처리)
          ...(x.sourceEntityId ? { gsi2pk: `SRC#${x.sourceEntityId}`, gsi2sk: occurredAt } : {}),
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    return true;
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return false; // 중복 이벤트
    throw e;
  }
}

/** 한 방향 집계 갱신 + 추천 점수/gsi 재계산 */
async function bumpOneDirection(
  userId: string,
  otherUserId: string,
  interactionType: InteractionType,
  occurredAt: string,
  nowMs: number,
): Promise<void> {
  const key = { pk: `USER#${userId}`, sk: `PAIRSTAT#${otherUserId}` };
  const updated = await docClient.send(
    new UpdateCommand({
      TableName: tableName(GRAPH_TABLE),
      Key: key,
      UpdateExpression:
        'ADD #cnt :one ' +
        'SET otherUserId = :other, lastInteractionAt = :occ, updatedAt = :occ, ' +
        'firstInteractionAt = if_not_exists(firstInteractionAt, :occ), ' +
        'isFriend = if_not_exists(isFriend, :false)',
      ExpressionAttributeNames: { '#cnt': COUNT_ATTR[interactionType] },
      ExpressionAttributeValues: { ':one': 1, ':other': otherUserId, ':occ': occurredAt, ':false': false },
      ReturnValues: 'ALL_NEW',
    }),
  );
  const stat = updated.Attributes ?? {};
  const score = scorePair(stat, nowMs);
  const isFriend = stat.isFriend === true;

  if (!isFriend && score >= RECOMMEND_THRESHOLD) {
    // 추천 후보 — gsi1에 점수 기록(내림차순 정렬용 제로패딩 sk)
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(GRAPH_TABLE),
        Key: key,
        UpdateExpression: 'SET recommendationScore = :s, gsi1pk = :g, gsi1sk = :gs',
        ExpressionAttributeValues: {
          ':s': score,
          ':g': `REC#${userId}`,
          ':gs': scoreSortKey(score, otherUserId),
        },
      }),
    );
  } else {
    // 친구이거나 임계값 미만 — 추천 후보에서 제외(gsi 제거)
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(GRAPH_TABLE),
        Key: key,
        UpdateExpression: 'SET recommendationScore = :s REMOVE gsi1pk, gsi1sk',
        ExpressionAttributeValues: { ':s': score },
      }),
    );
  }
}

/** 사용자쌍 집계 — 양방향 미러 갱신 */
export async function bumpPairStat(x: PairInteraction, occurredAt: string, nowMs: number): Promise<void> {
  await bumpOneDirection(x.actorUserId, x.targetUserId, x.interactionType, occurredAt, nowMs);
  await bumpOneDirection(x.targetUserId, x.actorUserId, x.interactionType, occurredAt, nowMs);
}

/**
 * 원본 삭제 반영 — sourceEntityId로 gsi2 역조회해 원장 항목을 deleted 처리.
 * 아카이브에서 원문 재노출을 막는다(집계 수치는 유지 — 정책상 허용).
 */
export async function markLedgerDeleted(sourceEntityId: string): Promise<void> {
  if (!sourceEntityId) return;
  const found = await docClient.send(
    new QueryCommand({
      TableName: tableName(GRAPH_TABLE),
      IndexName: 'gsi2',
      KeyConditionExpression: 'gsi2pk = :pk',
      ExpressionAttributeValues: { ':pk': `SRC#${sourceEntityId}` },
    }),
  );
  for (const item of found.Items ?? []) {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(GRAPH_TABLE),
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: 'SET visibilityState = :d, archiveEligible = :f',
        ExpressionAttributeValues: { ':d': 'deleted', ':f': false },
      }),
    );
  }
}
