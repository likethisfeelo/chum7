import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { AppEnv, docClient, fail, ok, publishEvent, tableName } from '@chum7/api-kit';
import { generateCouponCode } from '../domain/coupon-rules';
import { OrderStatus } from '../domain/order-state';
import { CouponItem, listAllCoupons, markCoupon, putCoupon } from '../repo/coupons';
import { appendLedger, getOrder, listLedger, listOrdersByStatus, transitionOrder } from '../repo/orders';
import { listBatchesByChallenge, listBatchesByLeader, putTicketBatch } from '../repo/tickets';

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

// ── 티켓 배부 (운영자 → 챌린지 리더) ───────────────────────────────────────
const issueBatchSchema = z.object({
  challengeId: z.string().min(1),
  total: z.number().int().min(1).max(500),
  memo: z.string().max(200).optional(),
});

// 배부 생성 — 리더는 challenge.createdBy로 자동 지정
commerceAdminRoutes.post('/ticket-batches', async (c) => {
  const { userId: adminId } = c.get('authUser')!;
  const input = issueBatchSchema.parse(await c.req.json().catch(() => ({})));
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName('CHALLENGES_TABLE'),
      Key: { pk: `CHAL#${input.challengeId}`, sk: 'META' },
      ProjectionExpression: 'challengeId, title, pricingType, price, createdBy',
    }),
  );
  const challenge = res.Item as
    | { challengeId: string; title?: string; pricingType?: string; price?: number; createdBy?: string }
    | undefined;
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  const paid =
    challenge.pricingType === 'paid_fee' || challenge.pricingType === 'paid_deposit' || Number(challenge.price ?? 0) > 0;
  if (!paid) return fail(c, 400, 'NOT_A_PAID_CHALLENGE', '무료 챌린지에는 티켓 배부가 필요 없습니다');
  const leaderId = String(challenge.createdBy ?? '');
  if (!leaderId) return fail(c, 400, 'NO_LEADER', '챌린지 리더를 확인할 수 없습니다');

  const nowIso = new Date().toISOString();
  const batchId = randomUUID();
  await putTicketBatch({
    batchId,
    challengeId: input.challengeId,
    challengeTitle: challenge.title ?? null,
    leaderId,
    total: input.total,
    issued: 0,
    createdBy: adminId,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await audit(adminId, 'ticket.batch_issue', input.challengeId, {
    batchId,
    leaderId,
    total: input.total,
    memo: input.memo ?? null,
  });
  return ok(c, { batchId, challengeId: input.challengeId, leaderId, total: input.total }, `티켓 ${input.total}장을 리더에게 배부했습니다`, 201);
});

// 배부 목록 — challengeId 또는 leaderId 필터
commerceAdminRoutes.get('/ticket-batches', async (c) => {
  const challengeId = (c.req.query('challengeId') ?? '').trim();
  const leaderId = (c.req.query('leaderId') ?? '').trim();
  if (!challengeId && !leaderId) {
    return fail(c, 400, 'MISSING_FILTER', 'challengeId 또는 leaderId 필터가 필요합니다');
  }
  const batches = challengeId
    ? await listBatchesByChallenge(challengeId)
    : await listBatchesByLeader(leaderId);
  return ok(c, { batches, total: batches.length });
});

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
