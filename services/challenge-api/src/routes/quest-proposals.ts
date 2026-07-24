/**
 * 개인 퀘스트 제안(유저 사이드) — POST /c/challenges/:challengeId/quest-proposals,
 * GET /c/challenges/:challengeId/quest-proposals/my
 * 레거시: backend/services/challenge/personal-quest/{submit,my} (v1 단순화 —
 * 상태는 pending/approved/rejected, 심사는 admin-api /adm/quest-proposals).
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { questProposalSchema } from '../schemas';
import {
  canProposeInLifecycle,
  decideSubmit,
  shouldAutoApproveProposal,
  sortProposalsLatestFirst,
  type ProposalStatus,
} from '../domain/proposal-rules';
import { getChallenge } from '../repo/challenges';
import { getParticipation } from '../repo/participations';
import { listMyProposals, proposalSk, putProposal, updateProposalFields } from '../repo/quest-proposals';
import { challengePk, stripKeys } from '../repo/shared';

export const questProposalRoutes = new Hono<AppEnv>();

// 제안 제출 (레거시 POST /challenges/{id}/personal-quest — upsert 의미 승계)
questProposalRoutes.post('/:challengeId/quest-proposals', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');
  const input = questProposalSchema.parse(await c.req.json().catch(() => ({})));

  const [challenge, participation] = await Promise.all([
    getChallenge(challengeId),
    getParticipation(challengeId, userId),
  ]);
  if (!challenge) {
    return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  }
  if (!challenge.personalQuestEnabled) {
    return fail(c, 400, 'PERSONAL_QUEST_DISABLED', '개인 퀘스트 제안이 비활성화된 챌린지입니다');
  }
  if (!participation) {
    return fail(c, 403, 'FORBIDDEN', '챌린지 참여자만 제안할 수 있습니다');
  }
  if (!canProposeInLifecycle(challenge.lifecycle)) {
    return fail(c, 409, 'INVALID_LIFECYCLE', '제안 제출 가능 기간이 아닙니다');
  }

  // 기본 자동승인 — 챌린지가 수동검토를 명시적으로 켠 경우에만 pending
  const autoApprove = shouldAutoApproveProposal(challenge);
  const proposals = sortProposalsLatestFirst(await listMyProposals(challengeId, userId));
  const latest = proposals[0];
  const decision = decideSubmit(latest?.status as ProposalStatus | undefined);
  // 수동검토 모드에서만 이미 승인된 제안의 재제출을 차단.
  // 자동승인 모드에서는 승인된 제안도 내용 교체(재등록)를 허용한다.
  if (!decision.allowed && !autoApprove) {
    return fail(c, 409, 'ALREADY_APPROVED', '이미 승인된 제안이 있습니다', {
      data: { proposal: latest ? stripKeys(latest) : null },
    });
  }

  const now = new Date().toISOString();
  const nextStatus = autoApprove ? 'approved' : 'pending';
  const reviewedBy = autoApprove ? 'auto' : null;
  const reviewedAt = autoApprove ? now : null;
  const isUpdate = Boolean(latest) && (decision.mode === 'update' || !decision.allowed);
  const successMessage = autoApprove
    ? '개인 퀘스트가 등록됐어요'
    : '개인 퀘스트 제안이 제출됐어요. 리더 승인 후 인증할 수 있어요';

  if (isUpdate && latest) {
    // 재제출 — 최신 내용으로 교체, 상태는 자동승인 여부에 따름, 피드백 초기화
    await updateProposalFields(challengeId, latest.sk as string, {
      title: input.title,
      description: input.description ?? '',
      status: nextStatus,
      leaderFeedback: null,
      reviewedBy,
      reviewedAt,
      updatedAt: now,
    });
    const updated = {
      ...stripKeys(latest),
      title: input.title,
      description: input.description ?? '',
      status: nextStatus,
      leaderFeedback: null,
      reviewedBy,
      reviewedAt,
      updatedAt: now,
    };
    return ok(c, updated, successMessage);
  }

  const proposalId = randomUUID();
  const item = {
    pk: challengePk(challengeId),
    sk: proposalSk(userId, proposalId),
    proposalId,
    challengeId,
    userId,
    title: input.title,
    description: input.description ?? '',
    status: nextStatus,
    leaderFeedback: null,
    reviewedBy,
    reviewedAt,
    createdAt: now,
    updatedAt: now,
  };
  await putProposal(item);
  return ok(c, stripKeys(item), successMessage, 201);
});

// 내 제안 조회 (레거시 GET /challenges/{id}/personal-quest — { latestProposal, proposals } 계약)
questProposalRoutes.get('/:challengeId/quest-proposals/my', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');

  const proposals = sortProposalsLatestFirst(await listMyProposals(challengeId, userId)).map(stripKeys);
  return ok(c, {
    latestProposal: proposals[0] ?? null,
    proposals,
  });
});
