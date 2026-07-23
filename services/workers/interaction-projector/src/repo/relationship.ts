import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { COUNT_ATTR, InteractionType, PairInteraction, pairKey } from '../domain/pairing';

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
          ...(x.actorDisplayName ? { actorDisplayName: x.actorDisplayName } : {}),
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

/**
 * 한 방향 집계 갱신 (친구 모델 v2 — 방향별 카운트).
 * dir='out': 이 파티션 주인이 actor (owner→other). dir='in': 주인이 target (other→owner).
 * 자격 판정은 read 시 outCount≥T && inCount≥T (docs/friend-model-v2.md).
 */
async function bumpOneDirection(
  ownerUserId: string,
  otherUserId: string,
  dir: 'out' | 'in',
  interactionType: InteractionType,
  occurredAt: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(GRAPH_TABLE),
      Key: { pk: `USER#${ownerUserId}`, sk: `PAIRSTAT#${otherUserId}` },
      UpdateExpression:
        'ADD #dir :one, #cnt :one ' +
        'SET otherUserId = :other, lastInteractionAt = :occ, updatedAt = :occ, ' +
        'firstInteractionAt = if_not_exists(firstInteractionAt, :occ), ' +
        'isFriend = if_not_exists(isFriend, :false)',
      ExpressionAttributeNames: {
        '#dir': dir === 'out' ? 'outCount' : 'inCount',
        '#cnt': COUNT_ATTR[interactionType], // per-type (요약 표시용)
      },
      ExpressionAttributeValues: { ':one': 1, ':other': otherUserId, ':occ': occurredAt, ':false': false },
    }),
  );
}

/** 사용자쌍 집계 — 양방향 미러 (actor 파티션=out, target 파티션=in) */
export async function bumpPairStat(x: PairInteraction, occurredAt: string): Promise<void> {
  await bumpOneDirection(x.actorUserId, x.targetUserId, 'out', x.interactionType, occurredAt);
  await bumpOneDirection(x.targetUserId, x.actorUserId, 'in', x.interactionType, occurredAt);
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
