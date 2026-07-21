/**
 * 예약 응원 라우트 — 레거시 cheer/get-scheduled·cancel-scheduled 이식
 * (레거시 핸들러 계약: test/backend/{get-scheduled,cancel-scheduled}.test.ts).
 * 목록: SENT 프로젝션(gsi1 SENT#) Query → META BatchGet → pending 예약분 필터.
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { fail, ok } from '@chum7/api-kit';
import { filterPendingScheduled, toScheduledView } from '../domain/cheer-views';
import { evaluateCancellation, resolveCancellationCutoffMinutes } from '../domain/scheduled-rules';
import { batchGetCheers, cancelScheduledCheer, getCheer, listSentPointers } from '../repo/cheers';
import { parseNextToken, toNextToken } from '../repo/shared';

export const scheduledRoutes = new Hono<AppEnv>();

// ── 예약 응원 목록 (GET /ch/scheduled) ──
scheduledRoutes.get('/', async (c) => {
  const { userId } = c.get('authUser')!;

  const rawLimit = (c.req.query('limit') || '20').trim();
  const parsedLimit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 20;

  let startKey: Record<string, any> | undefined;
  try {
    startKey = parseNextToken(c.req.query('nextToken'));
  } catch {
    return fail(c, 400, 'INVALID_NEXT_TOKEN', '유효하지 않은 nextToken 입니다');
  }

  const { items: pointers, lastKey } = await listSentPointers(userId, limit, startKey);
  const metas = await batchGetCheers(pointers.map((p) => p.cheerId as string));
  const byId = new Map(metas.map((m) => [m.cheerId, m]));
  const ordered = pointers
    .map((p) => byId.get(p.cheerId))
    .filter((m): m is Record<string, any> => !!m);

  const cheers = filterPendingScheduled(ordered).map(toScheduledView);

  return ok(c, { cheers, total: cheers.length, nextToken: toNextToken(lastKey) });
});

// ── 예약 응원 취소 (DELETE /ch/scheduled/:cheerId) ──
scheduledRoutes.delete('/:cheerId', async (c) => {
  const { userId } = c.get('authUser')!;
  const cheerId = c.req.param('cheerId')?.trim();
  if (!cheerId) {
    return fail(c, 400, 'MISSING_CHEER_ID', '응원 ID가 필요합니다');
  }

  const cheer = await getCheer(cheerId);
  const decision = evaluateCancellation({
    cheer,
    userId,
    nowMs: Date.now(),
    cutoffMinutes: resolveCancellationCutoffMinutes(process.env.CHEER_SCHEDULED_CANCELLATION_CUTOFF_MINUTES),
  });
  if (!decision.ok) {
    return fail(c, decision.status, decision.error, decision.message);
  }

  const now = new Date().toISOString();
  try {
    await cancelScheduledCheer(cheerId, now);
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return fail(c, 409, 'ALREADY_PROCESSED', '이미 처리된 응원입니다');
    }
    throw error;
  }

  return ok(c, { cheerId, status: 'cancelled', cancelledAt: now }, '예약 응원을 취소했어요');
});
