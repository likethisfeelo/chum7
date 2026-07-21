/**
 * 퀘스트 제출물 심사 — 레거시 quest/{admin-list,approve} 이식.
 * 신규 키에는 전역 status-index가 없어 challengeId 스코프 Query로 재작성 (풀스캔 금지 — PORTING.md §3).
 * 거절 시 ACTIVE 유니크 마커 DELETE → 재제출 허용 (challenge-api PORTING.md §C 계약).
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { fail, ok } from '@chum7/api-kit';
import { createQuestSchema, questReviewSchema, updateQuestSchema } from '../schemas';
import { canReviewSubmission, matchesStatusFilter, reviewOutcome, summarizeSubmissions } from '../domain/review-rules';
import {
  approveSubmissionTransaction,
  findSubmissionById,
  isTransactionConditionFailed,
  listChallengeSubmissions,
  getQuestItem,
  listQuests,
  putQuest,
  rejectSubmissionTransaction,
  updateQuestFields,
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

// ── 퀘스트 생성 (레거시 POST /admin/quests — admins/operators 또는 챌린지 생성자) ──
questReviewRoutes.post('/', async (c) => {
  const { userId, groups } = c.get('authUser')!;
  const input = createQuestSchema.parse(await c.req.json().catch(() => ({})));

  const challenge = await getChallenge(input.challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '연결할 챌린지가 없습니다');

  const canManageByGroup = groups.some((g) => ['admins', 'operators'].includes(g));
  const isChallengeCreator = challenge.createdBy === userId;
  if (!canManageByGroup && !isChallengeCreator) {
    return fail(c, 403, 'FORBIDDEN', '퀘스트 생성 권한이 없습니다');
  }

  // 챌린지 허용 인증 방식과의 교차 검증 (레거시 승계)
  const challengeAllowedTypes: string[] = Array.isArray(challenge.allowedVerificationTypes)
    ? challenge.allowedVerificationTypes
    : ['image', 'video', 'link', 'text'];
  const questAllowedTypes = input.allowedVerificationTypes ?? challengeAllowedTypes;
  if (!questAllowedTypes.every((t) => challengeAllowedTypes.includes(t))) {
    return fail(c, 400, 'INVALID_VERIFICATION_TYPES',
      `이 챌린지에서 허용되지 않는 인증 방식입니다. 허용: ${challengeAllowedTypes.join(', ')}`);
  }

  const questId = randomUUID();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const quest = {
    questId,
    title: input.title,
    description: input.description,
    challengeId: input.challengeId,
    allowedVerificationTypes: questAllowedTypes,
    verificationType: questAllowedTypes[0],
    verificationGuide: input.verificationGuide?.trim() || input.description,
    verificationConfig: input.verificationConfig,
    rewardPoints: input.rewardPoints,
    rewardBadgeId: input.rewardBadgeId ?? null,
    startAt: input.startAt ?? now,
    endAt: input.endAt ?? null,
    approvalRequired: input.approvalRequired,
    displayOrder: input.displayOrder,
    questLayer: input.questLayer,
    questScope: input.questScope,
    requireOnJoinInput: input.requireOnJoinInput,
    startDay: input.startDay,
    endDay: input.endDay,
    revealAt: input.revealAt,
    status: 'active',
    submissionCount: 0,
    approvedCount: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };
  await putQuest(quest);
  await recordAudit({
    actorUserId: userId, action: 'quest.create', targetType: 'quest', targetId: questId,
    payload: { challengeId: input.challengeId, title: input.title }, now: nowDate,
  });
  return ok(c, quest, '퀘스트가 생성되었습니다', 201);
});

// ── 퀘스트 수정 (레거시 PUT /admin/quests/{id} — 그룹 또는 퀘스트 생성자) ──
questReviewRoutes.put('/:questId', async (c) => {
  const { userId, groups } = c.get('authUser')!;
  const questId = c.req.param('questId');
  const input = updateQuestSchema.parse(await c.req.json().catch(() => ({})));
  const { challengeId, ...patch } = input;

  const quest = await getQuestItem(challengeId, questId);
  if (!quest) return fail(c, 404, 'QUEST_NOT_FOUND', '퀘스트를 찾을 수 없습니다');

  const canManageByGroup = groups.some((g) => ['admins', 'operators'].includes(g));
  const isQuestCreator = quest.createdBy === userId;
  if (!canManageByGroup && !isQuestCreator) {
    return fail(c, 403, 'FORBIDDEN', '퀘스트 수정 권한이 없습니다');
  }
  if (Object.keys(patch).length === 0) {
    return fail(c, 400, 'NO_UPDATE_FIELDS', '수정할 필드가 없습니다');
  }

  const nowDate = new Date();
  await updateQuestFields(challengeId, questId, { ...patch, updatedAt: nowDate.toISOString() });
  await recordAudit({
    actorUserId: userId, action: 'quest.update', targetType: 'quest', targetId: questId,
    payload: { challengeId, fields: Object.keys(patch) }, now: nowDate,
  });
  return ok(c, { questId, updated: Object.keys(patch) }, '퀘스트가 수정되었습니다');
});
