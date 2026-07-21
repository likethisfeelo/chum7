/**
 * 종료 정산 순수 로직 — PAYMENT_SPEC §6 (v0 축소: 수동 지급, ready→paid 두 상태).
 * AWS 무의존 — 핸들러(src/index.ts)가 이 계획(plan)대로 커머스 테이블에 기록한다.
 *
 * - 참가비형(paid_fee):   paid 주문 전액이 크리에이터 정산 대상
 * - 보증금형(paid_deposit): 완주자 주문 → 반환 대기(REFUND#), 미완주 주문 → 몰수(정산 대상)
 * - platformFee = floor(gross × feeRate), payout = gross − fee
 * - 멱등: 정산서 키가 SETTLEMENT#<challengeId> 고정 → attribute_not_exists 조건부 put으로
 *   중복 이벤트가 와도 한 번만 생성된다 (계획 자체도 순수 함수라 결정적).
 */

export const DEFAULT_FEE_RATE = 0.05;

export interface PaidOrderLike {
  orderId: string;
  userId: string;
  challengeId: string;
  challengeTitle?: string | null;
  amount: number;
  status: string;
}

/** env PLATFORM_FEE_RATE 해석 — 숫자가 아니거나 [0,1) 밖이면 기본 5% */
export function parseFeeRate(raw: string | undefined): number {
  const parsed = Number(raw ?? DEFAULT_FEE_RATE);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) return DEFAULT_FEE_RATE;
  return parsed;
}

export interface SettlementPlan {
  pricingType: 'paid_fee' | 'paid_deposit';
  /** 정산 모수가 된 paid 주문 수 */
  orderCount: number;
  /** 보증금형 완주자 주문 — REFUND# 반환 대기 생성 대상 */
  refundDueOrders: PaidOrderLike[];
  refundDueCount: number;
  /** 보증금형 미완주 주문 — 몰수(크리에이터 정산 대상), 원장 'deposit.forfeited' */
  forfeitedOrders: PaidOrderLike[];
  /** 몰수분 합(보증금형) 또는 참가비 합(참가비형) */
  grossAmount: number;
  platformFee: number;
  payoutAmount: number;
  /** settlement.ready 발행 여부 — 지급액도 반환 건도 없으면 알림 생략 */
  shouldPublishReady: boolean;
}

/** 완주/미완주 분류 + 수수료 계산 — status==='paid' 주문만 정산 모수 */
export function planSettlement(params: {
  pricingType: 'paid_fee' | 'paid_deposit';
  orders: PaidOrderLike[];
  completedUserIds: string[];
  feeRate: number;
}): SettlementPlan {
  const { pricingType, orders, completedUserIds, feeRate } = params;
  const paidOrders = orders.filter((o) => o.status === 'paid');

  let refundDueOrders: PaidOrderLike[] = [];
  let forfeitedOrders: PaidOrderLike[] = [];
  let grossAmount = 0;

  if (pricingType === 'paid_deposit') {
    const completed = new Set(completedUserIds);
    refundDueOrders = paidOrders.filter((o) => completed.has(o.userId));
    forfeitedOrders = paidOrders.filter((o) => !completed.has(o.userId));
    grossAmount = forfeitedOrders.reduce((sum, o) => sum + Number(o.amount ?? 0), 0);
  } else {
    // 참가비형 — 전 paid 주문이 크리에이터 정산 대상
    grossAmount = paidOrders.reduce((sum, o) => sum + Number(o.amount ?? 0), 0);
  }

  const platformFee = Math.floor(grossAmount * feeRate);
  const payoutAmount = grossAmount - platformFee;

  return {
    pricingType,
    orderCount: paidOrders.length,
    refundDueOrders,
    refundDueCount: refundDueOrders.length,
    forfeitedOrders,
    grossAmount,
    platformFee,
    payoutAmount,
    shouldPublishReady: payoutAmount > 0 || refundDueOrders.length > 0,
  };
}

/**
 * 반환 대기 아이템 — pk=REFUND#<orderId>/sk=META, gsi2 REFUNDSTATUS#refund_due 어드민 큐.
 * pk가 주문당 고정이라 conditional put(attribute_not_exists)으로 중복 생성이 방지된다.
 */
export function buildRefundItem(order: PaidOrderLike, nowIso: string): Record<string, unknown> {
  return {
    pk: `REFUND#${order.orderId}`,
    sk: 'META',
    gsi2pk: 'REFUNDSTATUS#refund_due',
    gsi2sk: nowIso,
    orderId: order.orderId,
    userId: order.userId,
    challengeId: order.challengeId,
    challengeTitle: order.challengeTitle ?? null,
    amount: Number(order.amount ?? 0),
    status: 'refund_due',
    createdAt: nowIso,
  };
}

/** 정산서 아이템 — pk=SETTLEMENT#<challengeId>/sk=META, gsi2 SETTLEMENTSTATUS#ready 어드민 큐 */
export function buildSettlementItem(params: {
  challengeId: string;
  creatorId: string;
  challengeTitle?: string | null;
  plan: SettlementPlan;
  nowIso: string;
}): Record<string, unknown> {
  const { challengeId, creatorId, challengeTitle, plan, nowIso } = params;
  return {
    pk: `SETTLEMENT#${challengeId}`,
    sk: 'META',
    gsi2pk: 'SETTLEMENTSTATUS#ready',
    gsi2sk: nowIso,
    challengeId,
    creatorId,
    challengeTitle: challengeTitle ?? null,
    pricingType: plan.pricingType,
    orderCount: plan.orderCount,
    refundDueCount: plan.refundDueCount,
    grossAmount: plan.grossAmount,
    platformFee: plan.platformFee,
    payoutAmount: plan.payoutAmount,
    status: 'ready',
    createdAt: nowIso,
  };
}
