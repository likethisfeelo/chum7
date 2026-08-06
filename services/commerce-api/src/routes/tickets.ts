import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { AppEnv, docClient, fail, ok, publishEvent, tableName } from '@chum7/api-kit';
import { appendLedger, putOrder } from '../repo/orders';
import {
  consumeBatchSlot,
  consumeTicket,
  getTicket,
  getTicketRequest,
  listBatchesByChallenge,
  listMyTickets,
  listTicketRequestsByChallenge,
  listTicketsByChallenge,
  putTicket,
  putTicketRequest,
  resolveTicketRequest,
} from '../repo/tickets';

/**
 * 유료 조인 티켓 — /pay/tickets/*  (requireAuth는 index.ts의 /pay/*)
 *  유저: 내 티켓함 조회 / 티켓 신청 / 티켓 소진(참여용 paid 주문 생성)
 *  리더: 현황(할당량·발급·신청 큐) / 발급(부여·신청 승인) / 신청 반려
 * 소진은 A안(주문 기반): amount=0, method='ticket'인 paid 주문을 만들어
 * 기존 join 결제 게이트를 그대로 통과시킨다. 정산 모수에서는 amount=0이라 제외된다.
 */
export const ticketRoutes = new Hono<AppEnv>();

const requestSchema = z.object({
  challengeId: z.string().min(1),
  message: z.string().trim().max(300).optional(),
});

const grantSchema = z.object({
  toUserId: z.string().min(1),
  // 신청 승인 경로면 true — 대상 유저의 pending 신청을 approved로 마킹
  fromRequest: z.boolean().optional(),
});

const rejectSchema = z.object({ reason: z.string().trim().max(300).optional() });

/** 챌린지 META 읽기 전용 — 소유자·매니저·유료 여부 확인 (routes/orders.ts 패턴) */
async function getChallengeMeta(challengeId: string) {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName('CHALLENGES_TABLE'),
      Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
      ProjectionExpression: 'challengeId, title, pricingType, price, lifecycle, createdBy, managerIds',
    }),
  );
  return res.Item as
    | { challengeId: string; title?: string; pricingType?: string; price?: number; lifecycle?: string; createdBy?: string; managerIds?: string[] }
    | undefined;
}

function isPaidChallenge(ch: { pricingType?: string; price?: number } | undefined): boolean {
  if (!ch) return false;
  return ch.pricingType === 'paid_fee' || ch.pricingType === 'paid_deposit' || Number(ch.price ?? 0) > 0;
}

// ── 유저 ──────────────────────────────────────────────────────────────────

// 내 티켓함 — 발급받은 티켓 전체 (offered/consumed)
ticketRoutes.get('/my', async (c) => {
  const { userId } = c.get('authUser')!;
  const tickets = await listMyTickets(userId);
  return ok(c, { tickets, total: tickets.length });
});

// 내 티켓 신청 상태 — 챌린지 1건
ticketRoutes.get('/my/request/:challengeId', async (c) => {
  const { userId } = c.get('authUser')!;
  const request = await getTicketRequest(c.req.param('challengeId'), userId);
  return ok(c, { request: request ?? null });
});

// 티켓 신청 — 유저가 리더에게 (유저 확인용 신청 시스템)
ticketRoutes.post('/request', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = requestSchema.parse(await c.req.json().catch(() => ({})));
  const challenge = await getChallengeMeta(input.challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  if (!isPaidChallenge(challenge)) {
    return fail(c, 400, 'NOT_A_PAID_CHALLENGE', '무료 챌린지는 티켓 없이 참여할 수 있어요');
  }
  if (challenge.lifecycle !== 'recruiting') {
    return fail(c, 409, 'NOT_RECRUITING', '모집 중인 챌린지만 티켓을 신청할 수 있어요');
  }
  const leaderId = String(challenge.createdBy ?? '');
  if (leaderId === userId) return fail(c, 409, 'LEADER_CANNOT_REQUEST', '리더는 티켓을 신청할 수 없어요');

  // 이미 발급받은 미사용 티켓이 있으면 신청 불필요
  const mine = await listMyTickets(userId);
  if (mine.some((t) => t.challengeId === input.challengeId && t.status === 'offered')) {
    return fail(c, 409, 'TICKET_ALREADY_OFFERED', '이미 발급받은 티켓이 있어요. 티켓으로 바로 참여하세요');
  }
  const existing = await getTicketRequest(input.challengeId, userId);
  if (existing?.status === 'pending') {
    return fail(c, 409, 'ALREADY_REQUESTED', '이미 검토 대기 중인 신청이 있어요');
  }

  const nowIso = new Date().toISOString();
  await putTicketRequest({
    challengeId: input.challengeId,
    userId,
    message: input.message ?? null,
    status: 'pending',
    createdAt: nowIso,
  });
  try {
    await publishEvent('ticket.requested', {
      challengeId: input.challengeId,
      userId,
      leaderId,
      message: input.message,
    });
  } catch (err: any) {
    console.error('ticket.requested publish error (non-fatal):', err?.message);
  }
  return ok(c, { challengeId: input.challengeId, status: 'pending' }, '티켓 신청을 보냈어요. 리더 승인 후 발급됩니다.', 201);
});

// 티켓 소진 — offered→consumed + paid 주문(amount=0, method='ticket') 생성 → orderId 반환
ticketRoutes.post('/:ticketId/use', async (c) => {
  const { userId } = c.get('authUser')!;
  const ticket = await getTicket(c.req.param('ticketId'));
  if (!ticket || ticket.userId !== userId) {
    return fail(c, 404, 'TICKET_NOT_FOUND', '티켓을 찾을 수 없습니다');
  }
  if (ticket.status === 'consumed') {
    return fail(c, 409, 'TICKET_ALREADY_USED', '이미 사용한 티켓이에요');
  }
  if (ticket.status !== 'offered') {
    return fail(c, 409, 'TICKET_NOT_USABLE', '사용할 수 없는 티켓이에요');
  }
  const challenge = await getChallengeMeta(ticket.challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  if (challenge.lifecycle !== 'recruiting') {
    return fail(c, 409, 'NOT_RECRUITING', '모집 중인 챌린지에서만 티켓을 사용할 수 있어요');
  }
  const pricingType = challenge.pricingType === 'paid_deposit' ? 'paid_deposit' : 'paid_fee';

  const orderId = randomUUID();
  const nowIso = new Date().toISOString();
  // 이중 사용 방지 — 조건부 전이가 성공한 요청만 주문 생성
  const consumed = await consumeTicket(ticket.ticketId, orderId, nowIso);
  if (!consumed) return fail(c, 409, 'TICKET_ALREADY_USED', '이미 사용한 티켓이에요');

  await putOrder({
    orderId,
    userId,
    challengeId: ticket.challengeId,
    challengeTitle: ticket.challengeTitle ?? challenge.title ?? null,
    amount: 0, // 무상 컴프 — 정산 모수 제외
    pricingType,
    method: 'ticket',
    status: 'paid',
    createdAt: nowIso,
    paidAt: nowIso,
  });
  await appendLedger(orderId, 'order.created', userId, { method: 'ticket', ticketId: ticket.ticketId });
  await appendLedger(orderId, 'order.paid', userId, { ticketId: ticket.ticketId });
  try {
    await publishEvent('order.paid', { orderId, userId, challengeId: ticket.challengeId, amount: 0 });
  } catch (err: any) {
    console.error('ticket use: order.paid publish error (non-fatal):', err?.message);
  }
  return ok(c, { orderId, ticketId: ticket.ticketId, status: 'paid' }, '티켓을 사용했어요. 이제 챌린지에 참여할 수 있어요!');
});

// ── 리더 ──────────────────────────────────────────────────────────────────

interface LeaderGuard {
  error?: Response;
  challenge?: NonNullable<Awaited<ReturnType<typeof getChallengeMeta>>>;
}

async function requireChallengeLeader(c: any, challengeId: string): Promise<LeaderGuard> {
  const challenge = await getChallengeMeta(challengeId);
  if (!challenge) return { error: fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다') };
  const { userId } = c.get('authUser')!;
  const managerIds = Array.isArray(challenge.managerIds) ? challenge.managerIds.map(String) : [];
  if (String(challenge.createdBy ?? '') !== userId && !managerIds.includes(userId)) {
    return { error: fail(c, 403, 'FORBIDDEN', '챌린지 리더·매니저만 사용할 수 있어요') };
  }
  return { challenge };
}

// 리더 현황 — 할당량 합계·잔여, 발급 티켓, 신청 큐
ticketRoutes.get('/leader/:challengeId', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireChallengeLeader(c, challengeId);
  if (guard.error) return guard.error;

  const [batches, tickets, requests] = await Promise.all([
    listBatchesByChallenge(challengeId),
    listTicketsByChallenge(challengeId),
    listTicketRequestsByChallenge(challengeId),
  ]);
  const total = batches.reduce((s, b) => s + Number(b.total ?? 0), 0);
  const issued = batches.reduce((s, b) => s + Number(b.issued ?? 0), 0);
  return ok(c, {
    quota: { total, issued, remaining: Math.max(0, total - issued) },
    batches,
    tickets,
    requests,
    pendingRequests: requests.filter((r) => r.status === 'pending').length,
  });
});

// 티켓 발급 — 특정 유저에게 부여(또는 신청 승인). 배부 잔여 슬롯 1개 소비.
ticketRoutes.post('/leader/:challengeId/grant', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireChallengeLeader(c, challengeId);
  if (guard.error) return guard.error;
  const challenge = guard.challenge!;
  const { userId: leaderId } = c.get('authUser')!;
  const input = grantSchema.parse(await c.req.json().catch(() => ({})));

  if (input.toUserId === leaderId) return fail(c, 409, 'CANNOT_GRANT_SELF', '본인에게는 발급할 수 없어요');

  // 대상 유저가 이미 미사용 티켓을 갖고 있으면 중복 발급 방지
  const existing = await listMyTickets(input.toUserId);
  if (existing.some((t) => t.challengeId === challengeId && t.status === 'offered')) {
    return fail(c, 409, 'TICKET_ALREADY_OFFERED', '이미 발급된 미사용 티켓이 있어요');
  }

  // 잔여 슬롯 확보 — 배부 배치들 중 여유 있는 것 하나에서 조건부 소비
  const nowIso = new Date().toISOString();
  const batches = await listBatchesByChallenge(challengeId);
  let slotBatchId: string | null = null;
  for (const b of batches) {
    if (Number(b.issued ?? 0) >= Number(b.total ?? 0)) continue;
    if (await consumeBatchSlot(b.batchId, nowIso)) {
      slotBatchId = b.batchId;
      break;
    }
  }
  if (!slotBatchId) {
    return fail(c, 409, 'NO_TICKETS_REMAINING', '남은 티켓 할당량이 없어요. 운영자에게 추가 배부를 요청하세요');
  }

  const ticketId = randomUUID();
  await putTicket({
    ticketId,
    batchId: slotBatchId,
    challengeId,
    challengeTitle: challenge.title ?? null,
    leaderId,
    userId: input.toUserId,
    status: 'offered',
    grantedBy: leaderId,
    createdAt: nowIso,
  });

  // 신청 승인 경로면 pending 신청을 approved로 (없거나 이미 처리돼도 발급은 유효)
  if (input.fromRequest) {
    await resolveTicketRequest({
      challengeId,
      userId: input.toUserId,
      status: 'approved',
      resolvedBy: leaderId,
      nowIso,
    }).catch(() => undefined);
  }

  try {
    await publishEvent('ticket.granted', {
      ticketId,
      challengeId,
      userId: input.toUserId,
      leaderId,
      challengeTitle: challenge.title ?? undefined,
    });
  } catch (err: any) {
    console.error('ticket.granted publish error (non-fatal):', err?.message);
  }
  return ok(c, { ticketId, challengeId, userId: input.toUserId, status: 'offered' }, '티켓을 발급했어요. 유저가 사용하면 참여가 확정됩니다.', 201);
});

// 티켓 신청 반려
ticketRoutes.post('/leader/:challengeId/requests/:userId/reject', async (c) => {
  const challengeId = c.req.param('challengeId');
  const targetUserId = c.req.param('userId');
  const guard = await requireChallengeLeader(c, challengeId);
  if (guard.error) return guard.error;
  const { userId: leaderId } = c.get('authUser')!;
  const input = rejectSchema.parse(await c.req.json().catch(() => ({})));

  const nowIso = new Date().toISOString();
  const done = await resolveTicketRequest({
    challengeId,
    userId: targetUserId,
    status: 'rejected',
    resolvedBy: leaderId,
    rejectReason: input.reason ?? null,
    nowIso,
  });
  if (!done) return fail(c, 409, 'ALREADY_RESOLVED', '이미 처리된 신청이에요');

  try {
    await publishEvent('ticket.request_rejected', {
      challengeId,
      userId: targetUserId,
      leaderId,
      reason: input.reason,
    });
  } catch (err: any) {
    console.error('ticket.request_rejected publish error (non-fatal):', err?.message);
  }
  return ok(c, { challengeId, userId: targetUserId, status: 'rejected' }, '신청을 반려했어요');
});
