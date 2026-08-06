/**
 * 콘텐츠 신고 — 사용자 제출. POST /s/reports (인증/마당글/댓글).
 * 관리자 신고큐/처리는 routes/moderation.ts (/s/mod/*).
 *
 * 정책(v0): 마당 표면(마당글·댓글·courtyard 사본)은 신고 1건 접수 즉시 자동숨김
 * (autoHiddenByReport 마커). 관리자가 반려하면 복원, 확정하면 숨김 유지.
 * 챌린지 피드의 인증 원본은 자동숨김하지 않는다 — 관리자 확정(/c/mod) 시에만.
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { createReportSchema } from '../schemas';
import { hasReported, incrementDailyReportCount, putReport } from '../repo/reports';
import {
  commentSk,
  getComment,
  getPost,
  setAdminPostIndexActive,
  setCommentHidden,
  setPostActive,
} from '../repo/plaza';

export const reportRoutes = new Hono<AppEnv>();

const preview = (text: unknown): string | null => {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return null;
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
};

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

  // 남용 가드 — 신고 1회=자동숨김이므로 일일 상한(20건)을 둔다
  if (!(await incrementDailyReportCount(userId))) {
    return fail(c, 429, 'REPORT_LIMIT', '오늘 신고 가능 횟수를 초과했어요. 내일 다시 시도해주세요');
  }

  // 대상 조회(미리보기·작성자) + 마당 표면 자동숨김. 실패는 접수를 막지 않는다(비치명).
  let contentPreview: string | null = null;
  let targetOwnerId: string | null = null;
  let autoHidden = false;
  try {
    if (input.targetType === 'plaza') {
      const post = await getPost(input.targetId);
      contentPreview = preview(post?.title) ?? preview(post?.content);
      targetOwnerId = post?.authorId ?? post?.userId ?? null;
      autoHidden = await setPostActive(input.targetId, false, { autoHiddenByReport: true });
      // 운영자 게시물이면 관리 인덱스도 동기화(포인터 없으면 내부에서 무시)
      if (autoHidden) await setAdminPostIndexActive(input.targetId, false);
    } else if (input.targetType === 'comment') {
      const sk = commentSk(input.commentCreatedAt!, input.targetId);
      const comment = await getComment(input.plazaPostId!, sk);
      contentPreview = preview(comment?.content);
      targetOwnerId = comment?.userId ?? null;
      autoHidden = await setCommentHidden(input.plazaPostId!, sk, true, { autoHiddenByReport: true });
    } else {
      // verification — 마당의 courtyard 사본만 숨김(챌린지 피드 원본은 관리자 확정 시).
      const courtyardId = `courtyard-${input.targetId}`;
      const copy = await getPost(courtyardId);
      if (copy) {
        contentPreview = preview(copy.content);
        targetOwnerId = copy.userId ?? null;
        autoHidden = await setPostActive(courtyardId, false, { autoHiddenByReport: true });
      }
    }
  } catch (err) {
    console.error('report auto-hide failed (non-fatal)', err);
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
    targetOwnerId,
    contentPreview,
    autoHidden,
    createdAt: now,
  });

  return ok(
    c,
    { reported: true, autoHidden },
    autoHidden ? '신고가 접수되어 마당에서 숨김 처리됐어요. 검토 후 확정돼요' : '신고가 접수됐어요',
    201,
  );
});
