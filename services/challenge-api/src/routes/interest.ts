/**
 * 관심 챌린지 라우트 — POST /c/challenges/:challengeId/interest (토글),
 * GET /c/challenges/:challengeId/interest/status
 * 레거시 핸들러 없음(프론트 로컬 저장으로만 동작하던 기능) — 최소 계약 `{ interested, count }`.
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { nextInterestCount, toggleInterestOutcome } from '../domain/interest-rules';
import { getChallenge } from '../repo/challenges';
import { adjustInterestCount, deleteInterest, getInterest, putInterest } from '../repo/interest';

export const interestRoutes = new Hono<AppEnv>();

// 관심 토글 (등록 ↔ 해제)
interestRoutes.post('/:challengeId/interest', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');

  const challenge = await getChallenge(challengeId);
  if (!challenge) {
    return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  }

  const existing = await getInterest(challengeId, userId);
  const outcome = toggleInterestOutcome(Boolean(existing));
  const now = new Date().toISOString();

  // 조건부 쓰기 — 동시 토글로 이미 반영된 경우 카운트를 건드리지 않는다
  const applied = outcome.interested
    ? await putInterest(challengeId, userId, now)
    : await deleteInterest(challengeId, userId);
  if (applied) {
    await adjustInterestCount(challengeId, outcome.delta, now);
  }

  const stats = (challenge.stats ?? {}) as Record<string, unknown>;
  return ok(
    c,
    {
      interested: outcome.interested,
      count: nextInterestCount(stats.interestCount, applied ? outcome.delta : 0),
    },
    outcome.message,
  );
});

// 관심 여부 + 카운트 조회
interestRoutes.get('/:challengeId/interest/status', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId');

  const [challenge, existing] = await Promise.all([
    getChallenge(challengeId),
    getInterest(challengeId, userId),
  ]);
  if (!challenge) {
    return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  }

  const stats = (challenge.stats ?? {}) as Record<string, unknown>;
  return ok(c, {
    interested: Boolean(existing),
    count: nextInterestCount(stats.interestCount, 0),
  });
});
