/**
 * 퍼블릭 업적 표면 — GET /public/users/:userId/achievements
 * 레거시: backend/services/personal-feed/achievements/index.ts (data 필드 형태 승계).
 * 뱃지는 gamification 테이블, 참여/인증/리더 이력은 challenges 테이블 read-only
 * (문서화된 크로스 도메인 예외 — repo/verifications-readonly.ts, PORTING.md §7).
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { buildAchievementsView } from '../domain/achievements';
import { listBadges } from '../repo/badges';
import {
  listCreatedChallenges,
  listUserParticipationSummaries,
  listUserVerificationSummaries,
} from '../repo/verifications-readonly';

export const publicUsersRoutes = new Hono<AppEnv>();

publicUsersRoutes.get('/:userId/achievements', async (c) => {
  const userId = c.req.param('userId').trim();
  if (!userId) {
    return fail(c, 400, 'MISSING_USER_ID', 'userId가 필요합니다');
  }

  const [participations, verifications, badges, createdChallenges] = await Promise.all([
    listUserParticipationSummaries(userId),
    listUserVerificationSummaries(userId),
    listBadges(userId),
    listCreatedChallenges(userId),
  ]);

  return ok(
    c,
    buildAchievementsView({
      participations,
      verifications,
      badges,
      createdChallenges,
    }),
  );
});
