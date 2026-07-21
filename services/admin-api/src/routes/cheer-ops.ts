/**
 * 응원 운영 — 레거시 admin/cheer/{monitor,dead-letter/*} 이식.
 * 데드레터는 gsi2 DLQ#<YYYY-MM-DD> 일자 파티션 Query (레거시 failedAt-index 재작성, 풀스캔 금지).
 * 재처리는 SCHED#pending gsi2 복구까지 포함 (cheer-scheduler가 다시 집도록 — PORTING.md §3).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { fail, ok } from '@chum7/api-kit';
import { requeueBatchSchema, requeueByQuerySchema } from '../schemas';
import {
  MAX_BATCH_SIZE,
  computeRequeueFields,
  dayPartitions,
  normalizeCheerIds,
  resolveIsoRange,
} from '../domain/dlq-rules';
import {
  countDlqByDay,
  getCheerMeta,
  getDeadLetter,
  isRequeueConflict,
  listCheersBySchedStatus,
  queryDeadLettersByDay,
  requeueTransaction,
} from '../repo/cheer-ops';
import { listParticipations } from '../repo/challenges';
import { recordAudit } from '../repo/audit';
import { parseNextToken, stripKeys, toNextToken } from '../repo/shared';

export const cheerOpsRoutes = new Hono<AppEnv>();

interface RequeueResult {
  cheerId: string;
  ok: boolean;
  error?: string;
}

async function requeueOne(cheerId: string, actorId: string, now: Date): Promise<RequeueResult> {
  const deadLetter = await getDeadLetter(cheerId);
  if (!deadLetter || deadLetter.status !== 'dead') {
    return { cheerId, ok: false, error: 'DEAD_LETTER_NOT_FOUND' };
  }
  const fields = computeRequeueFields(now);
  try {
    await requeueTransaction({ cheerId, actorId, nowIso: fields.nowIso, scheduledTime: fields.scheduledTime });
    return { cheerId, ok: true };
  } catch (error: any) {
    if (isRequeueConflict(error)) return { cheerId, ok: false, error: 'REQUEUE_CONFLICT' };
    return { cheerId, ok: false, error: 'REQUEUE_FAILED' };
  }
}

// ── 모니터 요약 (레거시 GET /admin/cheer/monitor) ──
cheerOpsRoutes.get('/monitor', async (c) => {
  const challengeId = (c.req.query('challengeId') ?? '').trim() || null;
  const statusFilter = c.req.query('status')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
  const limit = Math.min(Number(c.req.query('limit') || 50), 200);

  // 신규 키에는 challengeId-index가 없음 — SCHED#<status> 파티션 최신분 조회 (PORTING.md §3)
  const statuses = statusFilter ?? ['pending', 'sent', 'receiver_completed'];
  const pages = await Promise.all(
    statuses.map((st) => listCheersBySchedStatus(st, Math.ceil(limit / statuses.length))),
  );
  let cheers = pages.flat().map(stripKeys);
  if (challengeId) cheers = cheers.filter((ch) => ch.challengeId === challengeId);
  cheers = cheers.slice(0, limit);

  let userScores: Record<string, any>[] = [];
  if (challengeId) {
    userScores = (await listParticipations(challengeId)).map((uc) => ({
      userChallengeId: uc.userChallengeId,
      userId: uc.userId,
      score: uc.score ?? 0,
      thankScore: uc.thankScore ?? 0,
      consecutiveDays: uc.consecutiveDays ?? 0,
      currentDay: uc.currentDay ?? 1,
      status: uc.status,
    }));
  }

  const byStatus = cheers.reduce((acc: Record<string, number>, ch) => {
    acc[ch.status] = (acc[ch.status] || 0) + 1;
    return acc;
  }, {});
  const pick = (ch: Record<string, any>) => ({
    cheerId: ch.cheerId, senderId: ch.senderId, receiverId: ch.receiverId, challengeId: ch.challengeId,
    senderAlias: ch.senderAlias, senderDelta: ch.senderDelta, day: ch.day,
  });

  return ok(c, {
    summary: { total: cheers.length, byStatus },
    pending: cheers
      .filter((ch) => ch.status === 'pending')
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))
      .map((ch) => ({ ...pick(ch), scheduledTime: ch.scheduledTime, createdAt: ch.createdAt })),
    sent: cheers
      .filter((ch) => ch.status === 'sent')
      .sort((a, b) => (b.sentAt || b.createdAt || '').localeCompare(a.sentAt || a.createdAt || ''))
      .map((ch) => ({
        ...pick(ch), sentAt: ch.sentAt, isThankScoreGranted: ch.isThankScoreGranted ?? false,
        isThanked: ch.isThanked ?? false, reactionType: ch.reactionType ?? null,
      })),
    receiverCompleted: cheers
      .filter((ch) => ch.status === 'receiver_completed')
      .sort((a, b) => (b.thankScoreGrantedAt || '').localeCompare(a.thankScoreGrantedAt || ''))
      .map((ch) => ({ ...pick(ch), thankScoreGrantedAt: ch.thankScoreGrantedAt })),
    userScores,
  });
});

// ── 데드레터 목록 (레거시 GET /admin/cheer/dead-letters) ──
cheerOpsRoutes.get('/dead-letters', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 30), 1), 100);
  const failureCode = c.req.query('failureCode')?.trim() || undefined;
  const now = new Date();

  const { range, error } = resolveIsoRange(c.req.query('fromIso'), c.req.query('toIso'), now);
  if (!range) return fail(c, 400, 'INVALID_ISO_RANGE', error!);

  let cursor: { d?: string; k?: Record<string, any> } = {};
  try {
    cursor = (parseNextToken(c.req.query('nextToken')) as typeof cursor) ?? {};
  } catch {
    return fail(c, 400, 'INVALID_NEXT_TOKEN', 'nextToken 형식이 올바르지 않습니다');
  }

  const days = dayPartitions(range);
  const startIndex = cursor.d ? days.indexOf(cursor.d) : 0;
  const deadLetters: Record<string, any>[] = [];
  let nextToken: string | null = null;

  for (let i = Math.max(startIndex, 0); i < days.length; i += 1) {
    const date = days[i]!;
    let lastKey = i === startIndex ? cursor.k : undefined;
    do {
      const page = await queryDeadLettersByDay({
        date,
        status: 'dead',
        failureCode,
        limit: limit - deadLetters.length,
        exclusiveStartKey: lastKey,
      });
      deadLetters.push(...page.items.map(stripKeys));
      lastKey = page.lastKey;
      if (deadLetters.length >= limit) {
        nextToken = lastKey
          ? toNextToken({ d: date, k: lastKey })
          : i + 1 < days.length
            ? toNextToken({ d: days[i + 1]! })
            : null;
        break;
      }
    } while (lastKey);
    if (deadLetters.length >= limit) break;
  }

  return ok(c, { deadLetters, count: deadLetters.length, nextToken });
});

// ── 데드레터 통계 (레거시 GET /admin/cheer/dead-letters/stats) ──
cheerOpsRoutes.get('/dead-letters/stats', async (c) => {
  const now = new Date();
  const { range, error } = resolveIsoRange(c.req.query('fromIso'), c.req.query('toIso'), now);
  if (!range) return fail(c, 400, 'INVALID_ISO_RANGE', error!);

  const days = dayPartitions(range);
  const counts = await Promise.all(
    days.map(async (date) => {
      const [dead, requeued] = await Promise.all([
        countDlqByDay({ date, status: 'dead', fromIso: range.fromIso, toIso: range.toIso }),
        countDlqByDay({ date, status: 'requeued', fromIso: range.fromIso, toIso: range.toIso }),
      ]);
      return { dead, requeued };
    }),
  );
  const deadCount = counts.reduce((sum, x) => sum + x.dead, 0);
  const requeuedCount = counts.reduce((sum, x) => sum + x.requeued, 0);

  return ok(c, {
    fromIso: range.fromIso,
    toIso: range.toIso,
    deadCount,
    requeuedCount,
    unresolvedCount: Math.max(deadCount - requeuedCount, 0),
  });
});

// ── 조건 재처리 (레거시 POST /admin/cheer/dead-letters/requeue-by-query) ──
cheerOpsRoutes.post('/dead-letters/requeue-by-query', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = requeueByQuerySchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date();

  const { range, error } = resolveIsoRange(input.fromIso, input.toIso, now);
  if (!range) return fail(c, 400, 'INVALID_ISO_RANGE', error!);

  const limit = Math.min(Math.max(Number(input.limit || 20), 1), 50);
  const failureCode = String(input.failureCode || '').trim() || undefined;
  const dryRun = Boolean(input.dryRun);

  const candidates: Record<string, any>[] = [];
  for (const date of dayPartitions(range)) {
    let lastKey: Record<string, any> | undefined;
    do {
      const page = await queryDeadLettersByDay({
        date, status: 'dead', failureCode, fromIso: range.fromIso, toIso: range.toIso,
        exclusiveStartKey: lastKey,
      });
      for (const item of page.items) {
        candidates.push(item);
        if (candidates.length >= limit) break;
      }
      lastKey = page.lastKey;
    } while (lastKey && candidates.length < limit);
    if (candidates.length >= limit) break;
  }

  if (dryRun) {
    return ok(c, {
      dryRun: true,
      range: { fromIso: range.fromIso, toIso: range.toIso },
      filter: { failureCode: failureCode ?? null },
      matchedCount: candidates.length,
      candidateCheerIds: candidates.map((item) => item.cheerId),
    });
  }

  const results: RequeueResult[] = [];
  for (const item of candidates) {
    results.push(await requeueOne(String(item.cheerId), userId, now));
  }
  const successCount = results.filter((r) => r.ok).length;

  await recordAudit({
    actorUserId: userId, action: 'cheer.dlq.requeue-by-query', targetType: 'cheer-dlq', targetId: 'by-query',
    payload: { range, failureCode: failureCode ?? null, successCount, total: results.length }, now,
  });

  return ok(c, {
    dryRun: false,
    range: { fromIso: range.fromIso, toIso: range.toIso },
    filter: { failureCode: failureCode ?? null },
    total: results.length,
    successCount,
    failCount: results.length - successCount,
    results,
  });
});

// ── 일괄 재처리 (레거시 POST /admin/cheer/dead-letters/requeue-batch) ──
cheerOpsRoutes.post('/dead-letters/requeue-batch', async (c) => {
  const { userId } = c.get('authUser')!;
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return fail(c, 400, 'INVALID_BODY', '요청 본문 형식이 올바르지 않습니다');
  }
  const cheerIds = normalizeCheerIds(requeueBatchSchema.safeParse(body).success ? (body as any).cheerIds : []);
  if (cheerIds.length === 0) return fail(c, 400, 'INVALID_CHEER_IDS', 'cheerIds 배열이 필요합니다');
  if (cheerIds.length > MAX_BATCH_SIZE) {
    return fail(c, 400, 'BATCH_LIMIT_EXCEEDED', `한 번에 최대 ${MAX_BATCH_SIZE}건까지 재처리 가능합니다`);
  }

  const now = new Date();
  const results: RequeueResult[] = [];
  for (const cheerId of cheerIds) {
    results.push(await requeueOne(cheerId, userId, now));
  }
  const successCount = results.filter((r) => r.ok).length;

  await recordAudit({
    actorUserId: userId, action: 'cheer.dlq.requeue-batch', targetType: 'cheer-dlq', targetId: 'batch',
    payload: { cheerIds, successCount }, now,
  });

  return ok(c, { total: cheerIds.length, successCount, failCount: cheerIds.length - successCount, results });
});

// ── 데드레터 단건 (레거시 GET /admin/cheer/dead-letters/{cheerId}) ──
cheerOpsRoutes.get('/dead-letters/:cheerId', async (c) => {
  const cheerId = c.req.param('cheerId');
  const [deadLetter, cheerSnapshot] = await Promise.all([getDeadLetter(cheerId), getCheerMeta(cheerId)]);
  if (!deadLetter) return fail(c, 404, 'DEAD_LETTER_NOT_FOUND', '데드레터를 찾을 수 없습니다');
  return ok(c, { deadLetter: stripKeys(deadLetter), cheerSnapshot: cheerSnapshot ? stripKeys(cheerSnapshot) : null });
});

// ── 단건 재처리 (레거시 POST /admin/cheer/dead-letters/{cheerId}/requeue) ──
cheerOpsRoutes.post('/dead-letters/:cheerId/requeue', async (c) => {
  const { userId } = c.get('authUser')!;
  const cheerId = c.req.param('cheerId');
  const now = new Date();

  const result = await requeueOne(cheerId, userId, now);
  if (!result.ok && result.error === 'DEAD_LETTER_NOT_FOUND') {
    return fail(c, 404, 'DEAD_LETTER_NOT_FOUND', '재처리 가능한 dead-letter를 찾을 수 없습니다');
  }
  if (!result.ok) {
    return fail(c, 409, 'REQUEUE_CONFLICT', '이미 재처리 되었거나 원본 응원이 존재하지 않습니다');
  }

  await recordAudit({
    actorUserId: userId, action: 'cheer.dlq.requeue', targetType: 'cheer-dlq', targetId: cheerId, now,
  });
  return ok(c, { cheerId, scheduledTime: computeRequeueFields(now).scheduledTime });
});
