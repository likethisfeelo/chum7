/**
 * 관리자 모더레이션 — /s/mod/* (requireGroup admins/operators).
 *  신고큐 조회/처리 + 마당 게시물·댓글 숨김/복원.
 *  인증(verification) 숨김은 challenge-api /c/mod/* 에서 처리(테이블 소유 분리).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail, requireGroup } from '@chum7/api-kit';
import { listReports, listPendingReportsByTarget, getReport, updateReportStatus } from '../repo/reports';
import {
  commentSk,
  getComment,
  getPost,
  setAdminPostIndexActive,
  setCommentHidden,
  setPostActive,
} from '../repo/plaza';
import { stripKeys } from '../repo/shared';

export const moderationRoutes = new Hono<AppEnv>();

moderationRoutes.use('*', requireGroup('admins', 'operators'));

// 신고큐 목록 (기본 pending)
moderationRoutes.get('/reports', async (c) => {
  const status = c.req.query('status') || 'pending';
  const reports = (await listReports(status)).map(stripKeys);
  return ok(c, { reports, total: reports.length });
});

/**
 * 대상 단위 일괄 처리 — 같은 대상의 pending 신고 전부를 한 번에 종결.
 *  dismissed(반려): 접수 시 자동숨김(autoHiddenByReport)이었다면 마당에 복원.
 *  actioned(확정):  숨김 유지 + 마커 제거(마커 없는 setPostActive/setCommentHidden 호출).
 *  관리자가 별도로 확정 숨김한 콘텐츠(마커 없음)는 반려 복원에 휩쓸리지 않는다.
 *  주의: '/reports/:reportId'보다 먼저 등록해야 라우트가 잡힌다.
 */
moderationRoutes.put('/reports/resolve-by-target', async (c) => {
  const b = await c.req.json().catch(() => ({} as any));
  const targetType = String(b.targetType || '');
  const targetId = String(b.targetId || '');
  const status = b.status === 'dismissed' ? 'dismissed' : b.status === 'actioned' ? 'actioned' : null;
  if (!['verification', 'plaza', 'comment', 'live_room'].includes(targetType) || !targetId || !status) {
    return fail(c, 400, 'VALIDATION_ERROR', 'targetType·targetId·status가 필요합니다');
  }
  const pending = await listPendingReportsByTarget(targetType, targetId);
  if (pending.length === 0) return fail(c, 404, 'NO_PENDING_REPORTS', '처리할 대기 신고가 없습니다');

  const { userId } = c.get('authUser')!;
  for (const r of pending) {
    await updateReportStatus(String(r.createdAt), String(r.reportId), status, userId, b.note);
  }

  // 콘텐츠 상태 정리 — 자동숨김분 복원(반려) 또는 확정(마커 제거)
  let restored = false;
  const first = pending[0]!;
  try {
    if (targetType === 'comment') {
      if (first.plazaPostId && first.commentCreatedAt) {
        const sk = commentSk(String(first.commentCreatedAt), targetId);
        const comment = await getComment(String(first.plazaPostId), sk);
        if (comment?.autoHiddenByReport === true) {
          restored = status === 'dismissed';
          await setCommentHidden(String(first.plazaPostId), sk, status === 'actioned');
        }
      }
    } else if (targetType === 'plaza' || targetType === 'verification') {
      // plaza 원글 또는 verification의 courtyard 사본 (live_room은 자동숨김 대상이 아님 — 정리 불필요)
      const postId = targetType === 'plaza' ? targetId : `courtyard-${targetId}`;
      const post = await getPost(postId);
      if (post?.autoHiddenByReport === true) {
        restored = status === 'dismissed';
        const applied = await setPostActive(postId, status === 'actioned' ? false : true);
        if (applied) await setAdminPostIndexActive(postId, status === 'actioned' ? false : true);
      }
    }
  } catch (err) {
    console.error('resolve-by-target content sync failed (non-fatal)', err);
  }

  return ok(
    c,
    { targetType, targetId, status, updated: pending.length, restored },
    status === 'dismissed'
      ? restored
        ? `신고 ${pending.length}건을 반려하고 마당에 복원했어요`
        : `신고 ${pending.length}건을 반려했어요`
      : `신고 ${pending.length}건을 조치 완료로 처리했어요`,
  );
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

// 마당 게시물 숨김/복원 — 운영자 게시물 관리 인덱스(ADMINPOSTS)도 함께 동기화
moderationRoutes.post('/plaza/:plazaPostId/hide', async (c) => {
  const plazaPostId = c.req.param('plazaPostId');
  const applied = await setPostActive(plazaPostId, false);
  if (!applied) return fail(c, 404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다');
  await setAdminPostIndexActive(plazaPostId, false);
  return ok(c, { plazaPostId, hidden: true }, '마당 게시물을 숨겼어요');
});
moderationRoutes.post('/plaza/:plazaPostId/unhide', async (c) => {
  const plazaPostId = c.req.param('plazaPostId');
  const applied = await setPostActive(plazaPostId, true);
  if (!applied) return fail(c, 404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다');
  await setAdminPostIndexActive(plazaPostId, true);
  return ok(c, { plazaPostId, hidden: false }, '마당 게시물을 다시 노출했어요');
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
