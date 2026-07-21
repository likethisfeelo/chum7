/**
 * 퀘스트 제출물 심사 — 레거시 quest/{admin-list,approve} 이식.
 * 신규 키에는 전역 status-index가 없어 challengeId 스코프 Query로 재작성 (풀스캔 금지 — PORTING.md §3).
 * 거절 시 ACTIVE 유니크 마커 DELETE → 재제출 허용 (challenge-api PORTING.md §C 계약).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { fail, ok } from '@chum7/api-kit';
import { questReviewSchema } from '../schemas';
import { canReviewSubmission, matchesStatusFilter, reviewOutcome, summarizeSubmissions } from '../domain/review-rules';
import {
  approveSubmissionTransaction,
  findSubmissionById,
  isTransactionConditionFailed,
  listChallengeSubmissions,
  listQuests,
  rejectSubmissionTransaction,
} from '../repo/quests';
import { getChallenge } from '../repo/challenges';
import { recordAudit } from '../repo/audit';
import { stripKeys } from '../repo/shared';

export const questReviewRoutes = new Hono<AppEnv>();

// ── 심사 목록 (레거시 GET /admin/quests/submissions — challengeId 스코프 필수) ──
questReviewRoutes.get('/submissions', async (c) => {
  const challengeId = (c.req.query('challengeId') ?? '').trim();
  if (!challengeId) {
    return fail(c, 400, 'MISSING_CHALLENGE_ID', 'challengeId가 필요합니다 (신규 API는 챌린지 스코프 조회만 지원합니다)');
  }
  const status = c.req.query('status') ?? 'pending';
  const questId = c.req.query('questId') ?? undefined;
  const questScope = c.req.query('questScope') ?? undefined;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);

  const [allItems, quests] = await Promise.all([listChallengeSubmissions(challengeId), listQuests(challengeId)]);
  const questMap = new Map(quests.map((q) => [q.questId, stripKeys(q)]));

  const submissions = allItems
    .filter((item) => item.recordType === 'history')
    .filter((item) => matchesStatusFilter(item.status, status))
    .filter((item) => (questId ? item.questId === questId : true))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  let enriched = submissions.map((s) => ({ ...stripKeys(s), quest: questMap.get(s.questId) ?? null }));
  if (questScope && ['leader', 'personal', 'mixed'].includes(questScope)) {
    enriched = enriched.filter((item) => item.quest?.questScope === questScope);
  }
  enriched = enriched.slice(0, limit);

  return ok(c, {
    submissions: enriched,
    total: enriched.length,
    summary: summarizeSubmissions(enriched),
    nextToken: null,
  });
});

// ── 심사 (레거시 PUT /admin/quests/submissions/{submissionId}/review) ──
questReviewRoutes.put('/submissions/:submissionId/review', async (c) => {
  const { userId, groups } = c.get('authUser')!;
  const submissionId = c.req.param('submissionId');
  const input = questReviewSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date();

  const submission = await findSubmissionById(input.challengeId, submissionId);
  if (!submission) return fail(c, 404, 'SUBMISSION_NOT_FOUND', '제출물을 찾을 수 없습니다');

  // 권한: 운영 그룹(베이스 게이트 통과) 또는 챌린지 생성자 (레거시 승계)
  const challenge = await getChallenge(input.challengeId);
  const isCreator = Boolean(challenge?.createdBy && challenge.createdBy === userId);
  const hasOpsGroup = groups.some((g) => ['admins', 'operators', 'creators'].includes(g));
  if (!hasOpsGroup && !isCreator) {
    return fail(c, 403, 'FORBIDDEN', '제출물 심사 권한이 없습니다');
  }

  if (!canReviewSubmission(submission.status)) {
    return fail(c, 409, 'ALREADY_REVIEWED', `이미 처리된 제출물입니다 (status: ${submission.status})`);
  }

  const outcome = reviewOutcome(input.action);
  const txInput = {
    challengeId: input.challengeId,
    questId: String(submission.questId),
    userId: String(submission.userId),
    historySk: String(submission.sk),
    reviewerId: userId,
    reviewNote: input.reviewNote ?? null,
    nowIso: now.toISOString(),
  };

  try {
    if (input.action === 'approve') {
      await approveSubmissionTransaction(txInput);
    } else {
      await rejectSubmissionTransaction(txInput);
    }
  } catch (error: any) {
    if (isTransactionConditionFailed(error)) {
      return fail(c, 409, 'ALREADY_REVIEWED', '이미 처리된 제출물입니다');
    }
    throw error;
  }

  await recordAudit({
    actorUserId: userId,
    action: 'quest.review',
    targetType: 'quest-submission',
    targetId: submissionId,
    payload: { challengeId: input.challengeId, action: input.action, reviewNote: input.reviewNote ?? null },
    now,
  });

  return ok(
    c,
    { submissionId, status: outcome.status, rewardGranted: outcome.rewardGranted, canResubmit: outcome.canResubmit },
    outcome.message,
  );
});
