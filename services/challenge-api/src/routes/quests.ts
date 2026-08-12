/**
 * 퀘스트 사용자 라우트 — /c/:challengeId/quests...
 * 레거시: GET /quests?challengeId=, POST /quests/{questId}/submit, GET /quests/my-submissions
 * (어드민 생성/수정/리뷰는 admin-api 소관 — 이 서비스 범위 밖)
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { submitQuestSchema } from '../schemas';
import {
  normalizeQuestSubmissionContent,
  resolveQuestAllowedTypes,
  validateQuestSubmissionContent,
} from '../domain/quest-rules';
import {
  getActiveSubmission,
  getQuest,
  isTransactionConditionFailed,
  listMyQuestSubmissions,
  listQuests,
  submitQuestTransaction,
} from '../repo/quests';
import { stripKeys } from '../repo/shared';

export const questRoutes = new Hono<AppEnv>();

// 퀘스트 목록 + 내 제출 현황 (레거시 GET /quests?challengeId=&status=)
questRoutes.get('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId')!;
  const statusFilter = c.req.query('status') || 'active';
  const now = new Date().toISOString();

  let quests = await listQuests(challengeId);

  // status='all' 이면 상태·만료 필터를 건너뛴다 (리더 관리 화면에서 중단된 퀘스트까지 조회)
  const showAll = statusFilter === 'all';

  // 상태 필터 + 기간 만료 필터 + 개인 퀘스트 소유자 필터 + displayOrder 정렬 (레거시 승계)
  quests = quests
    .filter((q) => showAll || q.status === statusFilter)
    .filter((q) => showAll || !q.endAt || q.endAt >= now)
    .filter((q) => q.questScope !== 'personal' || q.assignedUserId === userId)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  if (quests.length === 0) {
    return ok(c, { quests: [], total: 0 });
  }

  // 현재 제출 상태 — ACTIVE 마커 조회 (레거시 activeQuestSubmissions BatchGet 대응)
  const activeItems = await Promise.all(
    quests.map((q) => getActiveSubmission(challengeId, q.questId, userId)),
  );

  const enrichedQuests = quests.map((q, i) => {
    const activeSubmission = activeItems[i] ?? null;
    return {
      ...stripKeys(q),
      mySubmission: activeSubmission
        ? {
            submissionId: activeSubmission.submissionId,
            status: activeSubmission.status,
            updatedAt: activeSubmission.updatedAt,
            // 제출 시각 — ACTIVE 마커는 챌린지당 1건이라 날짜 개념이 없어 프론트가
            // '오늘 완료' 판정에 쓴다. updatedAt은 승인 시각이라 다른 날 승인 시 오인됨.
            createdAt: activeSubmission.createdAt ?? null,
          }
        : null,
    };
  });

  return ok(c, { quests: enrichedQuests, total: enrichedQuests.length });
});

// 내 제출 내역 (레거시 GET /quests/my-submissions — gsi1 QSUBUSER Query)
questRoutes.get('/my-submissions', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId')!;
  const questId = c.req.query('questId');
  const statusFilter = c.req.query('status');
  const includeHistory = c.req.query('includeHistory') === 'true';

  const all = (await listMyQuestSubmissions(userId)).filter((s) => s.challengeId === challengeId);

  let submissions: Record<string, any>[];
  if (includeHistory) {
    submissions = all.filter((s) => {
      if (questId && s.questId !== questId) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      return true;
    });
    // questId 지정 시 attemptNumber 오름차순 정렬 (재제출 체인 보기 — 레거시 승계)
    if (questId) {
      submissions.sort((a, b) => (a.attemptNumber ?? 1) - (b.attemptNumber ?? 1));
    }
  } else {
    // 현재 상태 모드: 동일 questId 최신 제출만 유지 + rejected 제외 (레거시 승계)
    const filtered = all.filter((s) => {
      if (s.status === 'rejected') return false;
      if (questId && s.questId !== questId) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      return true;
    });
    const deduped = new Map<string, Record<string, any>>();
    for (const sub of filtered) {
      const existing = deduped.get(sub.questId);
      if (!existing || sub.createdAt > existing.createdAt) {
        deduped.set(sub.questId, sub);
      }
    }
    submissions = Array.from(deduped.values());
  }

  // 퀘스트 정보 enrichment
  const questIds = [...new Set(submissions.map((s) => s.questId as string))];
  const questItems = await Promise.all(questIds.map((id) => getQuest(challengeId, id)));
  const questMap = new Map(questItems.filter(Boolean).map((q) => [q!.questId, stripKeys(q!)]));

  const enriched = submissions.map((s) => ({
    ...stripKeys(s),
    quest: questMap.get(s.questId) ?? null,
  }));

  return ok(c, {
    submissions: enriched,
    total: enriched.length,
    mode: includeHistory ? 'history' : 'current',
  });
});

// 퀘스트 제출 (레거시 POST /quests/{questId}/submit — user+quest당 활성 제출 1건 조건부 보장)
questRoutes.post('/:questId/submit', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId')!;
  const questId = c.req.param('questId');
  const input = submitQuestSchema.parse(await c.req.json().catch(() => ({})));

  const quest = await getQuest(challengeId, questId);
  if (!quest) {
    return fail(c, 404, 'QUEST_NOT_FOUND', '퀘스트를 찾을 수 없습니다');
  }

  const now = new Date().toISOString();

  if (quest.status !== 'active') return fail(c, 409, 'QUEST_INACTIVE', '비활성화된 퀘스트입니다');
  if (quest.startAt > now) return fail(c, 409, 'QUEST_NOT_STARTED', '아직 시작되지 않은 퀘스트입니다');
  if (quest.endAt && quest.endAt < now) return fail(c, 409, 'QUEST_EXPIRED', '기간이 만료된 퀘스트입니다');

  const questAllowedTypes = resolveQuestAllowedTypes(quest);
  if (!questAllowedTypes.includes(input.verificationType)) {
    return fail(c, 400, 'VERIFICATION_TYPE_NOT_ALLOWED',
      `이 퀘스트에서 허용되지 않는 인증 방식입니다. 허용: ${questAllowedTypes.join(', ')}`);
  }

  const normalizedContent = normalizeQuestSubmissionContent(input.content);
  const contentError = validateQuestSubmissionContent(quest, normalizedContent, input.verificationType);
  if (contentError) {
    return fail(c, 400, 'INVALID_CONTENT', contentError);
  }

  // 이전 시도 이력 (재제출 체인 — 조회 실패는 비치명적, 레거시 승계)
  let previousAttempts: Record<string, any>[] = [];
  try {
    previousAttempts = (await listMyQuestSubmissions(userId)).filter((s) => s.questId === questId);
  } catch (historyLookupError: any) {
    console.warn('Quest submission history lookup skipped (non-fatal):', {
      errorName: historyLookupError?.name,
      message: historyLookupError?.message,
    });
  }

  const attemptNumber = previousAttempts.length + 1;
  const lastRejected = previousAttempts.find((s) => s.status === 'rejected');
  const previousSubmissionId = lastRejected?.submissionId ?? null;

  const submissionId = randomUUID();
  const autoApprove = !quest.approvalRequired;
  const status = autoApprove ? 'auto_approved' : 'pending';

  const submission = {
    submissionId,
    questId,
    userId,
    challengeId: quest.challengeId ?? challengeId,
    userChallengeId: input.userChallengeId ?? null,
    verificationType: input.verificationType,
    content: normalizedContent,
    status,
    rewardGranted: autoApprove,
    previousSubmissionId,
    attemptNumber,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
  };

  try {
    await submitQuestTransaction({ challengeId, questId, userId, submission, now });
  } catch (err: any) {
    if (isTransactionConditionFailed(err)) {
      const active = await getActiveSubmission(challengeId, questId, userId);
      return c.json({
        error: 'ALREADY_SUBMITTED',
        message: '이미 제출한 퀘스트입니다',
        status: active?.status,
        submissionId: active?.submissionId,
      }, 409);
    }
    throw err;
  }

  return ok(c, {
    submissionId,
    status,
    attemptNumber,
    rewardGranted: autoApprove,
    rewardPoints: autoApprove ? quest.rewardPoints : 0,
  }, autoApprove ? '제출이 완료되었습니다 (자동 승인)' : '제출이 완료되었습니다. 관리자 검토 후 포인트가 지급됩니다.', 201);
});
