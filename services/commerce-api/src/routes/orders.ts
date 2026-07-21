import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { AppEnv, docClient, fail, ok, publishEvent, tableName } from '@chum7/api-kit';
import { validateRedemption } from '../domain/coupon-rules';
import { isDepositExpired, MANUAL_DEPOSIT_TTL_HOURS } from '../domain/order-state';
import { getCoupon, listMyCoupons, markCoupon } from '../repo/coupons';
import { appendLedger, getOrder, listMyOrders, putOrder, transitionOrder } from '../repo/orders';

export const orderRoutes = new Hono<AppEnv>();

const createOrderSchema = z.object({
  challengeId: z.string().min(1),
  method: z.enum(['coupon', 'manual_deposit']),
  couponCode: z.string().trim().toUpperCase().optional(),
  depositorName: z.string().trim().min(1).max(30).optional(),
});

/** 챌린지 가격 정보 — challenges 테이블 읽기 전용 (문서화된 크로스 도메인 예외) */
async function getPaidChallengeInfo(challengeId: string) {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName('CHALLENGES_TABLE'),
      Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
      ProjectionExpression: 'challengeId, title, pricingType, price, lifecycle',
    }),
  );
  return result.Item as
    | { challengeId: string; title?: string; pricingType?: string; price?: number; lifecycle?: string }
    | undefined;
}

// 주문 생성 — 쿠폰 즉시 확정 또는 수동 입금 대기
orderRoutes.post('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = createOrderSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date();
  const nowIso = now.toISOString();

  const challenge = await getPaidChallengeInfo(input.challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  const pricingType = challenge.pricingType;
  if (pricingType !== 'paid_fee' && pricingType !== 'paid_deposit') {
    return fail(c, 400, 'NOT_A_PAID_CHALLENGE', '무료 챌린지는 주문 없이 바로 참여할 수 있습니다');
  }
  if (challenge.lifecycle !== 'recruiting') {
    return fail(c, 409, 'NOT_RECRUITING', '모집 중인 챌린지만 결제할 수 있습니다');
  }
  const amount = Number(challenge.price ?? 0);

  const orderId = randomUUID();
  const base = {
    orderId,
    userId,
    challengeId: input.challengeId,
    challengeTitle: challenge.title ?? null,
    amount,
    pricingType,
    method: input.method,
    createdAt: nowIso,
  } as const;

  if (input.method === 'coupon') {
    if (!input.couponCode) return fail(c, 400, 'MISSING_COUPON_CODE', '쿠폰 코드를 입력해주세요');
    const coupon = await getCoupon(input.couponCode);
    if (!coupon) return fail(c, 404, 'COUPON_NOT_FOUND', '존재하지 않는 쿠폰입니다');
    const rejection = validateRedemption(coupon, userId, input.challengeId, now);
    if (rejection) {
      const messages: Record<string, string> = {
        COUPON_NOT_ACTIVE: '이미 사용되었거나 회수된 쿠폰입니다',
        COUPON_EXPIRED: '만료된 쿠폰입니다',
        COUPON_NOT_YOURS: '다른 사용자에게 발급된 쿠폰입니다',
        COUPON_CHALLENGE_MISMATCH: '이 챌린지에서 사용할 수 없는 쿠폰입니다',
      };
      return fail(c, 400, rejection, messages[rejection] ?? '쿠폰을 사용할 수 없습니다');
    }
    // 동시 사용 방지: active → redeemed 조건부 전환이 성공한 요청만 주문 확정
    const marked = await markCoupon(coupon.code, 'active', 'redeemed', {
      redeemedByUserId: userId,
      redeemedOrderId: orderId,
      redeemedAt: nowIso,
    });
    if (!marked) return fail(c, 409, 'COUPON_ALREADY_REDEEMED', '이미 사용된 쿠폰입니다');

    await putOrder({ ...base, status: 'paid', couponCode: coupon.code, paidAt: nowIso });
    await appendLedger(orderId, 'order.created', userId, { method: 'coupon' });
    await appendLedger(orderId, 'order.paid', userId, { couponCode: coupon.code });
    await publishEvent('order.paid', { orderId, userId, challengeId: input.challengeId, amount });
    return ok(c, { order: { ...base, status: 'paid', couponCode: coupon.code } },
      '쿠폰이 적용되었습니다. 이제 챌린지에 참여할 수 있어요!', 201);
  }

  // 수동 입금 (PG 계약 전 무통장 운영)
  await putOrder({ ...base, status: 'awaiting_deposit', depositorName: input.depositorName ?? null });
  await appendLedger(orderId, 'order.created', userId, {
    method: 'manual_deposit',
    depositorName: input.depositorName ?? null,
  });
  return ok(
    c,
    {
      order: { ...base, status: 'awaiting_deposit' },
      guide: {
        message: '입금 확인 후 참여가 가능해집니다. 입금 계좌는 챌린지 안내를 확인해주세요.',
        expiresInHours: MANUAL_DEPOSIT_TTL_HOURS,
      },
    },
    '주문이 접수되었습니다. 입금 확인을 기다려주세요.',
    201,
  );
});

orderRoutes.get('/my', async (c) => {
  const { userId } = c.get('authUser')!;
  const orders = await listMyOrders(userId);
  return ok(c, { orders, total: orders.length });
});

orderRoutes.get('/coupons/my', async (c) => {
  const { userId } = c.get('authUser')!;
  const coupons = await listMyCoupons(userId);
  return ok(c, { coupons, total: coupons.length });
});

orderRoutes.get('/:orderId', async (c) => {
  const { userId } = c.get('authUser')!;
  const order = await getOrder(c.req.param('orderId'));
  if (!order || order.userId !== userId) {
    return fail(c, 404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
  }
  // 만료 lazy 처리 — 조회 시점에 72시간 경과한 입금 대기 주문은 만료로 전환
  if (order.status === 'awaiting_deposit' && isDepositExpired(order.createdAt, new Date())) {
    await transitionOrder(order.orderId, 'awaiting_deposit', 'expired', {});
    await appendLedger(order.orderId, 'order.expired', 'system');
    return ok(c, { order: { ...order, status: 'expired' } });
  }
  return ok(c, { order });
});

orderRoutes.post('/:orderId/cancel', async (c) => {
  const { userId } = c.get('authUser')!;
  const order = await getOrder(c.req.param('orderId'));
  if (!order || order.userId !== userId) {
    return fail(c, 404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
  }
  const done = await transitionOrder(order.orderId, 'awaiting_deposit', 'canceled', {
    resolvedBy: userId,
  });
  if (!done) return fail(c, 409, 'CANNOT_CANCEL', '입금 대기 상태의 주문만 취소할 수 있습니다');
  await appendLedger(order.orderId, 'order.canceled', userId);
  return ok(c, { orderId: order.orderId, status: 'canceled' }, '주문이 취소되었습니다');
});
