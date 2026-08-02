import { Hono } from 'hono';
import { AppEnv, ok } from '@chum7/api-kit';
import { aggregateUserWorld, kstDateString } from '../domain/world-summary';
import {
  getChallengeCategory,
  listUserParticipations,
  listUserTodayVerifications,
} from '../repo/verifications-readonly';

export const worldRoutes = new Hono<AppEnv>();

// GET /g/world/summary — 개인 여정(누적) 요약. 인증 필요.
// 유저 참여 레코드를 카테고리(8층)별로 누적해 questScore/cheerScore/thankScore를 계산한다.
worldRoutes.get('/summary', async (c) => {
  const { userId } = c.get('authUser')!;
  const now = new Date();

  const [participations, todayVerifications] = await Promise.all([
    listUserParticipations(userId),
    listUserTodayVerifications(userId, kstDateString(now)),
  ]);

  const uniqueChallengeIds = [
    ...new Set(
      participations
        .map((p) => (typeof p.challengeId === 'string' ? p.challengeId : ''))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const categoryPairs = await Promise.all(
    uniqueChallengeIds.map((id) => getChallengeCategory(id).then((cat) => [id, cat] as const)),
  );
  const categoryByChallenge = Object.fromEntries(categoryPairs);

  return ok(c, aggregateUserWorld({ participations, categoryByChallenge, todayVerifications }));
});
