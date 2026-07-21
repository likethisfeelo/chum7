/**
 * 감사 로그 조회 — 신규 ops 테이블 AUDIT# 월 파티션 / AUDITTARGET# gsi1 Query.
 * 레거시 admin/audit/list(퀘스트 제출 Scan 파생 로그)를 실제 감사 로그 저장소로 대체 (PORTING.md §3).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { fail, ok } from '@chum7/api-kit';
import { listAuditByMonth, listAuditByTarget } from '../repo/audit';
import { parseNextToken, stripKeys, toNextToken } from '../repo/shared';

export const auditRoutes = new Hono<AppEnv>();

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseLimit(raw: string | undefined): number {
  return Math.min(Math.max(Number(raw || 30), 1), 100);
}

// ── 월 파티션 조회 (GET /adm/audit?month=YYYY-MM) ──
auditRoutes.get('/', async (c) => {
  const month = (c.req.query('month') ?? new Date().toISOString().slice(0, 7)).trim();
  if (!MONTH_PATTERN.test(month)) {
    return fail(c, 400, 'INVALID_MONTH', 'month는 YYYY-MM 형식이어야 합니다');
  }
  const limit = parseLimit(c.req.query('limit'));

  let startKey: Record<string, any> | undefined;
  try {
    startKey = parseNextToken(c.req.query('nextToken'));
  } catch {
    return fail(c, 400, 'INVALID_NEXT_TOKEN', 'nextToken 형식이 올바르지 않습니다');
  }

  const page = await listAuditByMonth(month, limit, startKey);
  const logs = page.items.map(stripKeys);
  return ok(c, { month, logs, count: logs.length, nextToken: toNextToken(page.lastKey) });
});

// ── 대상별 조회 (GET /adm/audit/target/:targetId) ──
auditRoutes.get('/target/:targetId', async (c) => {
  const targetId = c.req.param('targetId');
  const limit = parseLimit(c.req.query('limit'));

  let startKey: Record<string, any> | undefined;
  try {
    startKey = parseNextToken(c.req.query('nextToken'));
  } catch {
    return fail(c, 400, 'INVALID_NEXT_TOKEN', 'nextToken 형식이 올바르지 않습니다');
  }

  const page = await listAuditByTarget(targetId, limit, startKey);
  const logs = page.items.map(stripKeys);
  return ok(c, { targetId, logs, count: logs.length, nextToken: toNextToken(page.lastKey) });
});
