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
import { resolveUserParam } from '../repo/users-readonly';
import {
  listCreatedChallenges,
  listUserParticipationSummaries,
  listUserVerificationSummaries,
} from '../repo/verifications-readonly';

export const publicUsersRoutes = new Hono<AppEnv>();

// :userId 는 원본 userId 또는 @handle (핸들 공유 링크·공개 프로필 페이지 대응)
publicUsersRoutes.get('/:userId/achievements', async (c) => {
  const raw = c.req.param('userId').trim();
  if (!raw) {
    return fail(c, 400, 'MISSING_USER_ID', 'userId가 필요합니다');
  }
  const userId = await resolveUserParam(raw);
  if (!userId) return fail(c, 404, 'HANDLE_NOT_FOUND', '사용자를 찾을 수 없습니다');

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
