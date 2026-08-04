/**
 * 인증 완료 인정 요청 (사용자) — /c/:challengeId/completion-requests
 *  POST /      : '이 게시물을 N일차 인증으로 인정해주세요' 요청 생성 → 리더에게 알림
 *  GET  /my    : 내 요청 목록
 * 리더 처리(승인/반려)는 routes/leader.ts (/c/:challengeId/leader/completion-requests).
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail, publishEvent } from '@chum7/api-kit';
import { completionRequestSchema } from '../schemas';
import { getChallenge } from '../repo/challenges';
import { getParticipation } from '../repo/participations';
import {
  completionRequestSk,
  listMyCompletionRequests,
  putCompletionRequest,
} from '../repo/completion-requests';
import { stripKeys } from '../repo/shared';

export const completionRequestRoutes = new Hono<AppEnv>();

completionRequestRoutes.post('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId')!;
  const parsed = completionRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다', {
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;

  const challenge = await getChallenge(challengeId);
  if (!challenge) return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  const participation = await getParticipation(challengeId, userId);
  if (!participation) return fail(c, 403, 'NOT_PARTICIPANT', '참여자만 요청할 수 있어요');

  const leaderId = String(challenge.createdBy || challenge.creatorId || challenge.leaderId || '');
  const requestId = randomUUID();
  const nowIso = new Date().toISOString();

  await putCompletionRequest({
    pk: `CHAL#${challengeId}`,
    sk: completionRequestSk(userId, requestId),
    requestId,
    challengeId,
    userId,
    day: input.day,
    verificationId: input.verificationId,
    message: input.message?.trim() || null,
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  if (leaderId) {
    try {
      await publishEvent('completion.requested', {
        challengeId,
        requestId,
        userId,
        leaderId,
        day: input.day,
        verificationId: input.verificationId,
      });
    } catch (err: any) {
      console.error('completion.requested publish error (non-fatal):', err?.message);
    }
  }

  return ok(c, { requestId, status: 'pending' }, '인정 요청을 보냈어요. 리더가 확인 후 처리합니다.', 201);
});

completionRequestRoutes.get('/my', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId')!;
  const items = (await listMyCompletionRequests(challengeId, userId))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .map(stripKeys);
  return ok(c, { requests: items, total: items.length });
});
