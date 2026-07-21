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

  const proposals = sortProposalsLatestFirst(await listMyProposals(challengeId, userId));
  const latest = proposals[0];
  const decision = decideSubmit(latest?.status as ProposalStatus | undefined);
  if (!decision.allowed) {
    return fail(c, 409, 'ALREADY_APPROVED', '이미 승인된 제안이 있습니다', {
      data: { proposal: latest ? stripKeys(latest) : null },
    });
  }

  const now = new Date().toISOString();

  if (decision.mode === 'update' && latest) {
    // 재제출 — 최신 내용으로 교체 + pending 복귀, 피드백 초기화 (레거시 submit upsert 승계)
    await updateProposalFields(challengeId, latest.sk as string, {
      title: input.title,
      description: input.description ?? '',
      status: 'pending',
      leaderFeedback: null,
      updatedAt: now,
    });
    const updated = {
      ...stripKeys(latest),
      title: input.title,
      description: input.description ?? '',
      status: 'pending',
      leaderFeedback: null,
      updatedAt: now,
    };
    return ok(c, updated, '개인 퀘스트 제안이 다시 제출됐어요');
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
    status: 'pending' as const,
    leaderFeedback: null,
    createdAt: now,
    updatedAt: now,
  };
  await putProposal(item);
  return ok(c, stripKeys(item), '개인 퀘스트 제안이 제출됐어요', 201);
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
