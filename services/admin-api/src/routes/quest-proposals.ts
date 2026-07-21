/**
 * 개인 퀘스트 제안 심사 — GET /adm/quest-proposals?challengeId=,
 * PUT /adm/quest-proposals/:proposalId/review
 * 레거시: backend/services/admin/personal-quest/{list,review} (v1 단순화 — 상태 갱신만.
 * 승인 시 퀘스트 아이템 자동 생성 없음: 참여자의 개인 퀘스트 반영은 프론트 안내로 충분).
 * 권한: admins/operators 또는 챌린지 생성자 (quest 생성 라우트 패턴 미러).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { fail, ok } from '@chum7/api-kit';
import { proposalReviewSchema } from '../schemas';
import { canReviewProposal, proposalReviewOutcome } from '../domain/review-rules';
import { findProposalById, listChallengeProposals, updateProposalReview } from '../repo/quest-proposals';
import { getChallenge } from '../repo/challenges';
import { recordAudit } from '../repo/audit';
import { stripKeys } from '../repo/shared';

export const questProposalReviewRoutes = new Hono<AppEnv>();

async function canManageChallenge(
  userId: string,
  groups: string[],
  challengeId: string,
): Promise<{ allowed: boolean; challengeExists: boolean }> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) return { allowed: false, challengeExists: false };
  const canManageByGroup = groups.some((g) => ['admins', 'operators'].includes(g));
  const isChallengeCreator = challenge.createdBy === userId;
  return { allowed: canManageByGroup || isChallengeCreator, challengeExists: true };
}

// ── 심사 목록 (레거시 GET /admin/challenges/{id}/personal-quest — 기본 pending) ──
questProposalReviewRoutes.get('/', async (c) => {
  const { userId, groups } = c.get('authUser')!;
  const challengeId = (c.req.query('challengeId') ?? '').trim();
  if (!challengeId) {
    return fail(c, 400, 'MISSING_CHALLENGE_ID', 'challengeId가 필요합니다');
  }
  const status = c.req.query('status') ?? 'pending';

  const gate = await canManageChallenge(userId, groups, challengeId);
  if (!gate.challengeExists) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  if (!gate.allowed) return fail(c, 403, 'FORBIDDEN', '제안 심사 권한이 없습니다');

  const proposals = (await listChallengeProposals(challengeId))
    .filter((item) => (status === 'all' ? true : item.status === status))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    .map(stripKeys);

  return ok(c, { proposals, total: proposals.length });
});

// ── 심사 (레거시 PUT /admin/personal-quest/{proposalId}/review) ──
questProposalReviewRoutes.put('/:proposalId/review', async (c) => {
  const { userId, groups } = c.get('authUser')!;
  const proposalId = c.req.param('proposalId');
  const input = proposalReviewSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date();

  const gate = await canManageChallenge(userId, groups, input.challengeId);
  if (!gate.challengeExists) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  if (!gate.allowed) return fail(c, 403, 'FORBIDDEN', '제안 심사 권한이 없습니다');

  const proposal = await findProposalById(input.challengeId, proposalId);
  if (!proposal) return fail(c, 404, 'PROPOSAL_NOT_FOUND', '제안서를 찾을 수 없습니다');

  if (!canReviewProposal(proposal.status)) {
    return fail(c, 409, 'ALREADY_REVIEWED', `이미 처리된 제안서입니다 (status: ${proposal.status})`);
  }

  const outcome = proposalReviewOutcome(input.decision);
  const applied = await updateProposalReview({
    challengeId: input.challengeId,
    sk: String(proposal.sk),
    status: outcome.status,
    reason: input.reason ?? null,
    reviewerId: userId,
    nowIso: now.toISOString(),
  });
  if (!applied) {
    return fail(c, 409, 'ALREADY_REVIEWED', '이미 처리된 제안서입니다');
  }

  await recordAudit({
    actorUserId: userId,
    action: 'quest-proposal.review',
    targetType: 'quest-proposal',
    targetId: proposalId,
    payload: { challengeId: input.challengeId, decision: input.decision, reason: input.reason ?? null },
    now,
  });

  return ok(c, { proposalId, status: outcome.status }, outcome.message);
});
