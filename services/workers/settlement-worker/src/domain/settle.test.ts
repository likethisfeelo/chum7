import {
  buildRefundItem,
  buildSettlementItem,
  DEFAULT_FEE_RATE,
  PaidOrderLike,
  parseFeeRate,
  planSettlement,
} from './settle';

const order = (overrides: Partial<PaidOrderLike>): PaidOrderLike => ({
  orderId: 'o-1',
  userId: 'u-1',
  challengeId: 'chal-1',
  challengeTitle: '아침 러닝 30일',
  amount: 10_000,
  status: 'paid',
  ...overrides,
});

describe('settle domain', () => {
  describe('parseFeeRate', () => {
    it('defaults to 5% when unset or invalid', () => {
      expect(parseFeeRate(undefined)).toBe(DEFAULT_FEE_RATE);
      expect(parseFeeRate('abc')).toBe(DEFAULT_FEE_RATE);
      expect(parseFeeRate('-0.1')).toBe(DEFAULT_FEE_RATE);
      expect(parseFeeRate('1')).toBe(DEFAULT_FEE_RATE); // 100% 이상은 설정 오류로 간주
    });

    it('parses a valid rate', () => {
      expect(parseFeeRate('0.1')).toBe(0.1);
      expect(parseFeeRate('0')).toBe(0);
    });
  });

  describe('보증금형(paid_deposit) 완주/미완주 분류', () => {
    it('splits paid orders into refund-due (완주) and forfeited (미완주)', () => {
      const plan = planSettlement({
        pricingType: 'paid_deposit',
        orders: [
          order({ orderId: 'o-1', userId: 'done-1' }),
          order({ orderId: 'o-2', userId: 'done-2', amount: 20_000 }),
          order({ orderId: 'o-3', userId: 'fail-1', amount: 30_000 }),
        ],
        completedUserIds: ['done-1', 'done-2'],
        feeRate: 0.05,
      });

      expect(plan.refundDueOrders.map((o) => o.orderId)).toEqual(['o-1', 'o-2']);
      expect(plan.forfeitedOrders.map((o) => o.orderId)).toEqual(['o-3']);
      expect(plan.refundDueCount).toBe(2);
      expect(plan.orderCount).toBe(3);
      // 몰수분만 정산 대상
      expect(plan.grossAmount).toBe(30_000);
      expect(plan.platformFee).toBe(1_500);
      expect(plan.payoutAmount).toBe(28_500);
    });

    it('ignores non-paid orders (awaiting_deposit/rejected 등)', () => {
      const plan = planSettlement({
        pricingType: 'paid_deposit',
        orders: [
          order({ orderId: 'o-1', userId: 'fail-1' }),
          order({ orderId: 'o-2', userId: 'fail-2', status: 'awaiting_deposit' }),
          order({ orderId: 'o-3', userId: 'done-1', status: 'rejected' }),
        ],
        completedUserIds: ['done-1'],
        feeRate: 0.05,
      });
      expect(plan.orderCount).toBe(1);
      expect(plan.refundDueCount).toBe(0);
      expect(plan.grossAmount).toBe(10_000);
    });

    it('all completed → payout 0, refunds only, still publishes ready', () => {
      const plan = planSettlement({
        pricingType: 'paid_deposit',
        orders: [order({ orderId: 'o-1', userId: 'done-1' })],
        completedUserIds: ['done-1'],
        feeRate: 0.05,
      });
      expect(plan.grossAmount).toBe(0);
      expect(plan.payoutAmount).toBe(0);
      expect(plan.refundDueCount).toBe(1);
      expect(plan.shouldPublishReady).toBe(true);
    });
  });

  describe('참가비형(paid_fee) 분기', () => {
    it('counts every paid order toward creator payout, no refunds', () => {
      const plan = planSettlement({
        pricingType: 'paid_fee',
        orders: [
          order({ orderId: 'o-1', userId: 'done-1', amount: 9_900 }),
          order({ orderId: 'o-2', userId: 'fail-1', amount: 9_900 }),
          order({ orderId: 'o-3', userId: 'x', status: 'expired' }),
        ],
        completedUserIds: ['done-1'],
        feeRate: 0.05,
      });
      expect(plan.refundDueCount).toBe(0);
      expect(plan.forfeitedOrders).toEqual([]);
      expect(plan.grossAmount).toBe(19_800);
      expect(plan.platformFee).toBe(990);
      expect(plan.payoutAmount).toBe(18_810);
      expect(plan.shouldPublishReady).toBe(true);
    });
  });

  describe('수수료 계산', () => {
    it('floors the platform fee (원 단위 절사)', () => {
      const plan = planSettlement({
        pricingType: 'paid_fee',
        orders: [order({ amount: 10_999 })],
        completedUserIds: [],
        feeRate: 0.05,
      });
      expect(plan.platformFee).toBe(549); // floor(549.95)
      expect(plan.payoutAmount).toBe(10_450);
    });

    it('fee rate 0 pays out the full gross', () => {
      const plan = planSettlement({
        pricingType: 'paid_fee',
        orders: [order({})],
        completedUserIds: [],
        feeRate: 0,
      });
      expect(plan.platformFee).toBe(0);
      expect(plan.payoutAmount).toBe(10_000);
    });
  });

  describe('멱등', () => {
    it('plan is deterministic — 같은 입력이면 같은 계획', () => {
      const input = {
        pricingType: 'paid_deposit' as const,
        orders: [
          order({ orderId: 'o-1', userId: 'done-1' }),
          order({ orderId: 'o-2', userId: 'fail-1' }),
        ],
        completedUserIds: ['done-1'],
        feeRate: 0.05,
      };
      expect(planSettlement(input)).toEqual(planSettlement(input));
    });

    it('settlement/refund items keep fixed pk — conditional put이 중복 이벤트를 차단', () => {
      const plan = planSettlement({
        pricingType: 'paid_deposit',
        orders: [order({ orderId: 'o-1', userId: 'fail-1' })],
        completedUserIds: [],
        feeRate: 0.05,
      });
      const first = buildSettlementItem({ challengeId: 'chal-1', creatorId: 'cr-1', plan, nowIso: '2026-07-21T00:00:00.000Z' });
      const second = buildSettlementItem({ challengeId: 'chal-1', creatorId: 'cr-1', plan, nowIso: '2026-07-22T09:00:00.000Z' });
      expect(first.pk).toBe('SETTLEMENT#chal-1');
      expect(second.pk).toBe(first.pk); // 시각이 달라도 키 동일 → attribute_not_exists로 한 번만 생성
      expect(first.sk).toBe('META');

      // 정산서는 held로 생성 + 종료+7일 holdUntil (환불 보류 버퍼)
      expect(first.status).toBe('held');
      expect(first.gsi2pk).toBe('SETTLEMENTSTATUS#held');
      expect(first.holdUntil).toBe('2026-07-28T00:00:00.000Z');
      expect(first.notifyOnRelease).toBe(true); // 몰수분 payout>0

      const refund = buildRefundItem(order({ orderId: 'o-9' }), '2026-07-21T00:00:00.000Z');
      expect(refund.pk).toBe('REFUND#o-9');
      expect(refund.gsi2pk).toBe('REFUNDSTATUS#refund_due');
      expect(refund.status).toBe('refund_due');
    });
  });
});
