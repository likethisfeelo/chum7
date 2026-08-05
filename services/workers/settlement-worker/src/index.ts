/**
 * settlement-worker — 챌린지 종료 정산 워커 (EventBridge rule: detail-type 'challenge.completed').
 * PAYMENT_SPEC §6의 v0 축소판(수동 지급): 정산서·반환 대기 큐를 만들고, 실제 송금은
 * 어드민이 계좌이체 후 /pay/admin/* 라우트로 완료 처리한다.
 *
 *  1. CHALLENGES_TABLE(READ-ONLY)에서 META 조회 — 무료 챌린지는 스킵
 *  2. COMMERCE_TABLE gsi3(ORDERCHAL#)로 챌린지 주문 조회, status==='paid'만 정산 모수
 *  3. 보증금형: 완주자 주문 → REFUND#<orderId> 반환 대기 + 원장 'refund.due',
 *     미완주 주문 → 원장 'deposit.forfeited' (몰수 — 크리에이터 정산 대상)
 *  4. SETTLEMENT#<challengeId> 정산서 조건부 생성(attribute_not_exists — 중복 이벤트 멱등)
 *  5. settlement.ready 발행 (지급액도 반환 건도 없으면 생략)
 *
 * Env: CHALLENGES_TABLE, COMMERCE_TABLE, EVENT_BUS_NAME, PLATFORM_FEE_RATE(기본 0.05)
 */
import type { EventBridgeEvent } from 'aws-lambda';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import {
  buildRefundItem,
  buildSettlementItem,
  PaidOrderLike,
  parseFeeRate,
  planSettlement,
} from './domain/settle';

const COMMERCE_TABLE = 'COMMERCE_TABLE';
const CHALLENGES_TABLE = 'CHALLENGES_TABLE';
/** 시스템 행위자 — 원장 actorUserId에 기록 */
const SYSTEM_ACTOR = 'settlement-worker';

interface ChallengeCompletedDetail {
  challengeId: string;
  completedUserIds: string[];
}

interface ChallengeMeta {
  challengeId: string;
  title?: string;
  pricingType?: string;
  price?: number;
  createdBy?: string;
}

/** 챌린지 META — challenges READ-ONLY (COMMERCE_V0.md 크로스 도메인 등록) */
async function getChallengeMeta(challengeId: string): Promise<ChallengeMeta | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(CHALLENGES_TABLE),
      Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
      ProjectionExpression: 'challengeId, title, pricingType, price, createdBy',
    }),
  );
  return res.Item as ChallengeMeta | undefined;
}

/** 챌린지 전체 주문 — commerce gsi3 ORDERCHAL# (repo/orders.ts listOrdersByChallenge와 동일 키) */
async function listOrdersByChallenge(challengeId: string): Promise<PaidOrderLike[]> {
  const items: PaidOrderLike[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(COMMERCE_TABLE),
        IndexName: 'gsi3',
        KeyConditionExpression: 'gsi3pk = :pk',
        ExpressionAttributeValues: { ':pk': `ORDERCHAL#${challengeId}` },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((res.Items ?? []) as PaidOrderLike[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 원장 append — repo/orders.ts appendLedger와 동일 키 설계 (수정·삭제 없음) */
async function appendLedger(orderId: string, event: string, detail?: Record<string, unknown>): Promise<void> {
  const at = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: tableName(COMMERCE_TABLE),
      Item: {
        pk: `ORDER#${orderId}`,
        sk: `LEDGER#${at}#${Math.random().toString(36).slice(2, 6)}`,
        event,
        actorUserId: SYSTEM_ACTOR,
        detail: detail ?? null,
        at,
      },
    }),
  );
}

async function settlementExists(challengeId: string): Promise<boolean> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(COMMERCE_TABLE),
      Key: { pk: `SETTLEMENT#${challengeId}`, sk: 'META' },
      ProjectionExpression: 'pk',
    }),
  );
  return Boolean(res.Item);
}

function isConditionalFailure(error: unknown): boolean {
  return (error as { name?: string })?.name === 'ConditionalCheckFailedException';
}

const log = (level: 'info' | 'warn', message: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ level, message, ...extra }));

export const handler = async (event: EventBridgeEvent<'challenge.completed', ChallengeCompletedDetail>) => {
  const challengeId = String(event.detail?.challengeId ?? '');
  const completedUserIds = (event.detail?.completedUserIds ?? []).map(String);
  if (!challengeId) {
    log('warn', 'challenge.completed without challengeId, skipped', { eventId: event.id });
    return { statusCode: 200, body: JSON.stringify({ skipped: 'missing challengeId' }) };
  }
  log('info', 'settlement triggered', { challengeId, completedCount: completedUserIds.length });

  const challenge = await getChallengeMeta(challengeId);
  const pricingType = challenge?.pricingType;
  if (!challenge || (pricingType !== 'paid_fee' && pricingType !== 'paid_deposit')) {
    log('info', 'not a paid challenge, settlement skipped', { challengeId, pricingType: pricingType ?? null });
    return { statusCode: 200, body: JSON.stringify({ challengeId, skipped: 'not paid' }) };
  }

  // 멱등: 정산서가 이미 있으면 중복 이벤트 — 반환/원장 재기록 없이 종료
  if (await settlementExists(challengeId)) {
    log('info', 'settlement already exists, duplicate event ignored', { challengeId });
    return { statusCode: 200, body: JSON.stringify({ challengeId, skipped: 'already settled' }) };
  }

  const orders = await listOrdersByChallenge(challengeId);
  const plan = planSettlement({
    pricingType,
    orders,
    completedUserIds,
    feeRate: parseFeeRate(process.env.PLATFORM_FEE_RATE),
  });

  if (plan.orderCount === 0) {
    log('info', 'no paid orders, nothing to settle', { challengeId });
    return { statusCode: 200, body: JSON.stringify({ challengeId, skipped: 'no paid orders' }) };
  }

  const nowIso = new Date().toISOString();
  let refundsCreated = 0;

  // 보증금형 완주자 — 반환 대기 생성(주문당 1회) + 원장 기록
  for (const order of plan.refundDueOrders) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: tableName(COMMERCE_TABLE),
          Item: buildRefundItem(order, nowIso),
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      await appendLedger(order.orderId, 'refund.due', { challengeId, amount: order.amount });
      refundsCreated += 1;
    } catch (error) {
      if (isConditionalFailure(error)) {
        log('info', 'refund item already exists, skipped', { orderId: order.orderId });
        continue;
      }
      throw error;
    }
  }

  // 보증금형 미완주 — 몰수 기록 (크리에이터 정산 대상)
  for (const order of plan.forfeitedOrders) {
    await appendLedger(order.orderId, 'deposit.forfeited', { challengeId, amount: order.amount });
  }

  // 정산서 조건부 생성 — 경합/중복 이벤트에도 한 번만
  const creatorId = String(challenge.createdBy ?? '');
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(COMMERCE_TABLE),
        Item: buildSettlementItem({ challengeId, creatorId, challengeTitle: challenge.title ?? null, plan, nowIso }),
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  } catch (error) {
    if (isConditionalFailure(error)) {
      log('info', 'settlement created concurrently, event publish skipped', { challengeId });
      return { statusCode: 200, body: JSON.stringify({ challengeId, skipped: 'concurrent settlement' }) };
    }
    throw error;
  }

  // 정산서는 held로 생성됨 — settlement.ready 알림은 어드민 release(환불 보류 경과) 시 발행한다.
  const summary = {
    challengeId,
    pricingType,
    status: 'held',
    orderCount: plan.orderCount,
    refundsCreated,
    forfeited: plan.forfeitedOrders.length,
    grossAmount: plan.grossAmount,
    platformFee: plan.platformFee,
    payoutAmount: plan.payoutAmount,
  };
  log('info', 'settlement created (held)', summary);
  return { statusCode: 200, body: JSON.stringify(summary) };
};
