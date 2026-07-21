/**
 * 운영 대시보드 통계 — 레거시 admin/stats/overview 이식 (풀스캔 전면 재작성).
 * v1 원칙: Query로 산출 가능한 값만 계산, 스캔 전제 값은 null + note (PORTING.md §3).
 *  - totalChallenges: gsi1 lifecycle×category 파티션 COUNT 합산
 *  - verificationDaily: gsi2 VFPUB#<KST 날짜> COUNT (공개 인증만 — 부분 지표)
 *  - totalUsers/totalParticipations/operations/전체 인증 지표: null (운영 GSI·집계 워커 도입 후)
 */
import { Hono } from 'hono';
import type { ApiContext, AppEnv } from '@chum7/api-kit';
import { ok } from '@chum7/api-kit';
import { countAllChallenges, countPublicVerificationsByDate } from '../repo/challenges';

export const statsRoutes = new Hono<AppEnv>();

/** KST 기준 YYYY-MM-DD (VFPUB gsi2 파티션 키가 KST 날짜 — challenge-api 계약) */
function kstDate(base: Date, minusDays: number): string {
  return new Date(base.getTime() + 9 * 60 * 60 * 1000 - minusDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function overview(c: ApiContext) {
  const now = new Date();

  const days = Array.from({ length: 7 }, (_, i) => kstDate(now, 6 - i));
  const [totalChallenges, dailyCounts] = await Promise.all([
    countAllChallenges(),
    Promise.all(days.map((date) => countPublicVerificationsByDate(date))),
  ]);

  const verificationDaily = days.map((date, i) => ({ date, count: dailyCounts[i] ?? 0 }));
  const recent7DaysCount = verificationDaily.reduce((sum, d) => sum + d.count, 0);

  return ok(c, {
    totalUsers: null,
    totalChallenges,
    totalParticipations: null,
    operations: null,
    verifications: {
      total: null,
      remedyCount: null,
      extraCount: null,
      recent7DaysCount,
      verificationDaily,
    },
    notes: {
      totalUsers: '전체 사용자 수는 스캔 전제 지표 — 운영 GSI/집계 워커 도입 후 제공 (PORTING.md)',
      totalParticipations: '전체 참여 수는 스캔 전제 지표 — 집계 워커 도입 후 제공',
      operations: '퀘스트 심사 전역 집계는 챌린지 스코프 조회(GET /adm/quests/submissions)로 대체',
      verifications: 'verificationDaily/recent7DaysCount는 공개 인증(VFPUB)만 집계한 부분 지표',
    },
    timestamp: now.toISOString(),
  });
}

// 레거시 GET /admin/stats 와 GET /admin/stats/overview 모두 동일 응답
statsRoutes.get('/', overview);
statsRoutes.get('/overview', overview);
