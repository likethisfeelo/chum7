/**
 * 관리자 모더레이션 — /s/mod/* (requireGroup admins/operators).
 *  신고큐 조회/처리 + 마당 게시물·댓글 숨김/복원.
 *  인증(verification) 숨김은 challenge-api /c/mod/* 에서 처리(테이블 소유 분리).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail, requireGroup } from '@chum7/api-kit';
import { listReports, getReport, updateReportStatus } from '../repo/reports';
import { setPostActive, setCommentHidden, commentSk } from '../repo/plaza';
import { stripKeys } from '../repo/shared';

export const moderationRoutes = new Hono<AppEnv>();

moderationRoutes.use('*', requireGroup('admins', 'operators'));

// 신고큐 목록 (기본 pending)
moderationRoutes.get('/reports', async (c) => {
  const status = c.req.query('status') || 'pending';
  const reports = (await listReports(status)).map(stripKeys);
  return ok(c, { reports, total: reports.length });
});

// 신고 처리 상태 전환 (actioned=조치완료 / dismissed=반려)
moderationRoutes.put('/reports/:reportId', async (c) => {
  const reportId = c.req.param('reportId');
  const body = await c.req.json().catch(() => ({} as any));
  const createdAt = String(body.createdAt || '');
  const status = body.status === 'dismissed' ? 'dismissed' : body.status === 'actioned' ? 'actioned' : null;
  if (!createdAt || !status) return fail(c, 400, 'VALIDATION_ERROR', 'createdAt·status가 필요합니다');
  const existing = await getReport(createdAt, reportId);
  if (!existing) return fail(c, 404, 'REPORT_NOT_FOUND', '신고를 찾을 수 없습니다');
  const { userId } = c.get('authUser')!;
  await updateReportStatus(createdAt, reportId, status, userId, body.note);
  return ok(c, { reportId, status });
});

// 마당 게시물 숨김/복원
moderationRoutes.post('/plaza/:plazaPostId/hide', async (c) => {
  await setPostActive(c.req.param('plazaPostId'), false);
  return ok(c, { plazaPostId: c.req.param('plazaPostId'), hidden: true }, '마당 게시물을 숨겼어요');
});
moderationRoutes.post('/plaza/:plazaPostId/unhide', async (c) => {
  await setPostActive(c.req.param('plazaPostId'), true);
  return ok(c, { plazaPostId: c.req.param('plazaPostId'), hidden: false }, '마당 게시물을 다시 노출했어요');
});

// 댓글 숨김/복원
moderationRoutes.post('/comments/hide', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.plazaPostId || !b.commentId || !b.commentCreatedAt) {
    return fail(c, 400, 'VALIDATION_ERROR', 'plazaPostId·commentId·commentCreatedAt이 필요합니다');
  }
  const okUpd = await setCommentHidden(b.plazaPostId, commentSk(b.commentCreatedAt, b.commentId), true);
  if (!okUpd) return fail(c, 404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다');
  return ok(c, { hidden: true }, '댓글을 숨겼어요');
});
moderationRoutes.post('/comments/unhide', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.plazaPostId || !b.commentId || !b.commentCreatedAt) {
    return fail(c, 400, 'VALIDATION_ERROR', 'plazaPostId·commentId·commentCreatedAt이 필요합니다');
  }
  const okUpd = await setCommentHidden(b.plazaPostId, commentSk(b.commentCreatedAt, b.commentId), false);
  if (!okUpd) return fail(c, 404, 'COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다');
  return ok(c, { hidden: false }, '댓글을 다시 노출했어요');
});
