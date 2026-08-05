/**
 * 주문 상태 머신 — 커머스 v0 (PG 계약 전 수동 운영).
 * PAYMENT_SPEC §5의 상태 모델을 축소 구현. PG 도입 시 웹훅이 confirm 역할을 대체한다
 * (awaiting_deposit → paid 전이 주체가 어드민 → PG 웹훅으로 바뀔 뿐, 머신은 동일).
 */
export type OrderStatus =
  | 'awaiting_deposit' // 수동 입금 대기 (v0) / PG 결제 대기 (v1)
  | 'paid' // 결제 확인 — 유료 챌린지 참여 자격
  | 'rejected' // 어드민 거절 (입금 미확인 등)
  | 'canceled' // 사용자 취소
  | 'expired'; // 기한 만료

// ticket: 리더 발급 유료 조인 티켓 소진 — 즉시 paid, amount=0 (무상 컴프, 정산 모수 제외)
export type OrderMethod = 'coupon' | 'manual_deposit' | 'ticket';

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  awaiting_deposit: ['paid', 'rejected', 'canceled', 'expired'],
  paid: [], // v0에서는 환불 없음 (PAYMENT_SPEC Phase 3에서 refunded 추가)
  rejected: [],
  canceled: [],
  expired: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** 주문이 유료 챌린지 참여 자격을 부여하는 상태인가 */
export function isJoinEligible(order: {
  status?: string;
  userId?: string;
  challengeId?: string;
}, userId: string, challengeId: string): boolean {
  return (
    order.status === 'paid' &&
    order.userId === userId &&
    order.challengeId === challengeId
  );
}

/** 수동 입금 주문 만료 판정 (생성 후 72시간) */
export const MANUAL_DEPOSIT_TTL_HOURS = 72;

export function isDepositExpired(createdAt: string, now: Date): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now.getTime() - created > MANUAL_DEPOSIT_TTL_HOURS * 3600_000;
}
