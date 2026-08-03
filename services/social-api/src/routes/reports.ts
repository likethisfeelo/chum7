/**
 * 콘텐츠 신고 — 사용자 제출. POST /s/reports (인증/마당글/댓글).
 * 관리자 신고큐/처리는 routes/moderation.ts (/s/mod/*).
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { createReportSchema } from '../schemas';
import { hasReported, putReport } from '../repo/reports';

export const reportRoutes = new Hono<AppEnv>();

reportRoutes.post('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const parsed = createReportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다', {
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;

  // 이미 같은 대상을 신고했으면 조용히 성공 처리 (중복 큐 방지)
  if (await hasReported(userId, input.targetType, input.targetId)) {
    return ok(c, { reported: true, duplicate: true }, '이미 신고한 콘텐츠예요');
  }

  const now = new Date().toISOString();
  await putReport({
    reportId: randomUUID(),
    status: 'pending',
    targetType: input.targetType,
    targetId: input.targetId,
    challengeId: input.challengeId ?? null,
    plazaPostId: input.plazaPostId ?? null,
    commentCreatedAt: input.commentCreatedAt ?? null,
    reason: input.reason,
    detail: input.detail?.trim() || null,
    reporterId: userId,
    contentPreview: null,
    createdAt: now,
  });

  return ok(c, { reported: true }, '신고가 접수됐어요', 201);
});
