import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
