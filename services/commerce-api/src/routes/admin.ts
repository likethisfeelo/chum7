import { Hono } from 'hono';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { AppEnv, docClient, fail, ok, publishEvent, tableName } from '@chum7/api-kit';
import { generateCouponCode } from '../domain/coupon-rules';
import { OrderStatus } from '../domain/order-state';
import { CouponItem, listAllCoupons, markCoupon, putCoupon } from '../repo/coupons';
import { appendLedger, getOrder, listLedger, listOrdersByStatus, transitionOrder } from '../repo/orders';

/**
 * /pay/admin/* — 슈퍼어드민(admins 그룹) 전용. requireGroup은 index.ts에서 적용.
 * 모든 금전 관련 어드민 행위는 OPS 감사 로그에 기록한다.
 */
export const commerceAdminRoutes = new Hono<AppEnv>();

export async function audit(actorUserId: string, action: string, targetId: string, detail?: unknown) {
  const at = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: tableName('OPS_TABLE'),
      Item: {
        pk: `AUDIT#${at.slice(0, 7)}`,
        sk: `${at}#${Math.random().toString(36).slice(2, 8)}`,
        gsi1pk: `AUDITTARGET#${targetId}`,
        gsi1sk: at,
        actorUserId,
        action,
        target: targetId,
        detail: detail ?? null,
        at,
      },
    }),
  );
}

// ── 쿠폰 발급/관리 ─────────────────────────────────────────────────────────
const issueCouponSchema = z.object({
  challengeId: z.string().min(1), // 'ANY' 허용
  issuedToUserId: z.string().min(1).optional(),
  count: z.number().int().min(1).max(50).default(1),
  expiresAt: z.string().datetime().optional(),
  memo: z.string().max(200).optional(),
});

commerceAdminRoutes.post('/coupons', async (c) => {
  const { userId: adminId } = c.get('authUser')!;
  const input = issueCouponSchema.parse(await c.req.json().catch(() => ({})));
  const nowIso = new Date().toISOString();

  const coupons: CouponItem[] = [];
  for (let i = 0; i < input.count; i += 1) {
    const coupon: CouponItem = {
      code: generateCouponCode(),
      challengeId: input.challengeId,
      issuedToUserId: input.issuedToUserId ?? null,
      status: 'active',
      expiresAt: input.expiresAt ?? null,
      memo: input.memo ?? null,
      createdBy: adminId,
      createdAt: nowIso,
    };
    await putCoupon(coupon);
    coupons.push(coupon);
  }
  await audit(adminId, 'coupon.issue', input.issuedToUserId ?? 'unassigned', {
    challengeId: input.challengeId,
    codes: coupons.map((x) => x.code),
    memo: input.memo ?? null,
  });
  return ok(c, { coupons }, `쿠폰 ${coupons.length}장을 발급했습니다`, 201);
});

commerceAdminRoutes.get('/coupons', async (c) => {
  const coupons = await listAllCoupons();
  return ok(c, { coupons, total: coupons.length });
});

commerceAdminRoutes.post('/coupons/:code/revoke', async (c) => {
  const { userId: adminId } = c.get('authUser')!;
  const code = c.req.param('code').toUpperCase();
  const revoked = await markCoupon(code, 'active', 'revoked');
  if (!revoked) return fail(c, 409, 'CANNOT_REVOKE', '활성 상태의 쿠폰만 회수할 수 있습니다');
  await audit(adminId, 'coupon.revoke', code);
  return ok(c, { code, status: 'revoked' }, '쿠폰을 회수했습니다');
});

// ── 수동 결제(입금) 확인 ───────────────────────────────────────────────────
const listOrdersSchema = z.object({
  status: z
    .enum(['awaiting_deposit', 'paid', 'rejected', 'canceled', 'expired'])
    .default('awaiting_deposit'),
});

commerceAdminRoutes.get('/orders', async (c) => {
  const { status } = listOrdersSchema.parse({
    status: c.req.query('status') ?? undefined,
  });
  const orders = await listOrdersByStatus(status as OrderStatus);
  return ok(c, { orders, total: orders.length, status });
});

commerceAdminRoutes.get('/orders/:orderId', async (c) => {
  const order = await getOrder(c.req.param('orderId'));
  if (!order) return fail(c, 404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
  const ledger = await listLedger(order.orderId);
  return ok(c, { order, ledger });
});

const resolveSchema = z.object({ memo: z.string().max(200).optional() });

commerceAdminRoutes.post('/orders/:orderId/confirm', async (c) => {
  const { userId: adminId } = c.get('authUser')!;
  const input = resolveSchema.parse(await c.req.json().catch(() => ({})));
  const order = await getOrder(c.req.param('orderId'));
  if (!order) return fail(c, 404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');

  const done = await transitionOrder(order.orderId, 'awaiting_deposit', 'paid', {
    paidAt: new Date().toISOString(),
    resolvedBy: adminId,
    memo: input.memo ?? null,
  });
  if (!done) return fail(c, 409, 'INVALID_STATE', '입금 대기 상태의 주문만 확인할 수 있습니다');

  await appendLedger(order.orderId, 'order.paid', adminId, { memo: input.memo ?? null });
  await audit(adminId, 'order.confirm', order.orderId, {
    userId: order.userId,
    challengeId: order.challengeId,
    amount: order.amount,
  });
  await publishEvent('order.paid', {
    orderId: order.orderId,
    userId: order.userId,
    challengeId: order.challengeId,
    amount: order.amount,
  });
  return ok(c, { orderId: order.orderId, status: 'paid' }, '입금을 확인했습니다');
});

commerceAdminRoutes.post('/orders/:orderId/reject', async (c) => {
  const { userId: adminId } = c.get('authUser')!;
  const input = resolveSchema.parse(await c.req.json().catch(() => ({})));
  const order = await getOrder(c.req.param('orderId'));
  if (!order) return fail(c, 404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');

  const done = await transitionOrder(order.orderId, 'awaiting_deposit', 'rejected', {
    resolvedBy: adminId,
    memo: input.memo ?? null,
  });
  if (!done) return fail(c, 409, 'INVALID_STATE', '입금 대기 상태의 주문만 거절할 수 있습니다');

  await appendLedger(order.orderId, 'order.rejected', adminId, { memo: input.memo ?? null });
  await audit(adminId, 'order.reject', order.orderId, { userId: order.userId });
  await publishEvent('order.rejected', {
    orderId: order.orderId,
    userId: order.userId,
    challengeId: order.challengeId,
  });
  return ok(c, { orderId: order.orderId, status: 'rejected' }, '주문을 거절했습니다');
});
