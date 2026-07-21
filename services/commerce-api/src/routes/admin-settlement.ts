import { Hono } from 'hono';
import { z } from 'zod';
import { AppEnv, fail, ok, publishEvent } from '@chum7/api-kit';
import { appendLedger } from '../repo/orders';
import {
  getRefund,
  getSettlement,
  listRefundsByStatus,
  listSettlementsByStatus,
  RefundStatus,
  SettlementStatus,
  transitionRefund,
  transitionSettlement,
} from '../repo/settlements';
import { audit } from './admin';

/**
 * /pay/admin/refunds, /pay/admin/settlements — 슈퍼어드민(admins) 전용, requireGroup은 index.ts.
 * settlement-worker가 만든 반환 대기/정산서를 어드민이 수동 송금 후 완료 처리한다.
 * v0: 실제 이체는 계좌이체 수동 — 시스템은 상태 전이·원장·감사 로그·알림만 기록.
 */
export const commerceAdminSettlementRoutes = new Hono<AppEnv>();

const memoSchema = z.object({ memo: z.string().max(200).optional() });

// ── 보증금 반환 (완주자) ───────────────────────────────────────────────────
const listRefundsSchema = z.object({
  status: z.enum(['refund_due', 'completed']).default('refund_due'),
});

commerceAdminSettlementRoutes.get('/refunds', async (c) => {
  const { status } = listRefundsSchema.parse({ status: c.req.query('status') ?? undefined });
  const refunds = await listRefundsByStatus(status as RefundStatus);
  return ok(c, { refunds, total: refunds.length, status });
});

commerceAdminSettlementRoutes.post('/refunds/:orderId/complete', async (c) => {
  const { userId: adminId } = c.get('authUser')!;
  const input = memoSchema.parse(await c.req.json().catch(() => ({})));
  const refund = await getRefund(c.req.param('orderId'));
  if (!refund) return fail(c, 404, 'REFUND_NOT_FOUND', '반환 건을 찾을 수 없습니다');

  const done = await transitionRefund(refund.orderId, 'refund_due', 'completed', {
    completedAt: new Date().toISOString(),
    completedBy: adminId,
    memo: input.memo ?? null,
  });
  if (!done) return fail(c, 409, 'INVALID_STATE', '반환 대기 상태의 건만 완료 처리할 수 있습니다');

  await appendLedger(refund.orderId, 'refund.completed', adminId, {
    amount: refund.amount,
    memo: input.memo ?? null,
  });
  await audit(adminId, 'refund.complete', refund.orderId, {
    userId: refund.userId,
    challengeId: refund.challengeId,
    amount: refund.amount,
    memo: input.memo ?? null,
  });
  await publishEvent('refund.completed', {
    orderId: refund.orderId,
    userId: refund.userId,
    challengeId: refund.challengeId,
    amount: refund.amount,
  });
  return ok(c, { orderId: refund.orderId, status: 'completed' }, '보증금 반환을 완료 처리했습니다');
});

// ── 크리에이터 정산 ────────────────────────────────────────────────────────
const listSettlementsSchema = z.object({
  status: z.enum(['ready', 'paid']).default('ready'),
});

commerceAdminSettlementRoutes.get('/settlements', async (c) => {
  const { status } = listSettlementsSchema.parse({ status: c.req.query('status') ?? undefined });
  const settlements = await listSettlementsByStatus(status as SettlementStatus);
  return ok(c, { settlements, total: settlements.length, status });
});

commerceAdminSettlementRoutes.post('/settlements/:challengeId/mark-paid', async (c) => {
  const { userId: adminId } = c.get('authUser')!;
  const input = memoSchema.parse(await c.req.json().catch(() => ({})));
  const settlement = await getSettlement(c.req.param('challengeId'));
  if (!settlement) return fail(c, 404, 'SETTLEMENT_NOT_FOUND', '정산서를 찾을 수 없습니다');

  const done = await transitionSettlement(settlement.challengeId, 'ready', 'paid', {
    paidAt: new Date().toISOString(),
    paidBy: adminId,
    memo: input.memo ?? null,
  });
  if (!done) return fail(c, 409, 'INVALID_STATE', '지급 대기(ready) 상태의 정산서만 지급 완료할 수 있습니다');

  await audit(adminId, 'settlement.pay', settlement.challengeId, {
    creatorId: settlement.creatorId,
    payoutAmount: settlement.payoutAmount,
    platformFee: settlement.platformFee,
    memo: input.memo ?? null,
  });
  await publishEvent('settlement.paid', {
    settlementId: settlement.challengeId,
    creatorId: settlement.creatorId,
    amount: settlement.payoutAmount,
  });
  return ok(c, { challengeId: settlement.challengeId, status: 'paid' }, '정산 지급을 완료 처리했습니다');
});
