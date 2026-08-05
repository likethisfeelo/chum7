/**
 * 퍼블릭 탐색 라우트 — /public/challenges...
 * 레거시: GET /challenges (Scan) → gsi1 Query 재작성, GET /challenges/{id}, GET /challenges/{id}/stats
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { getChallenge, queryDiscovery } from '../repo/challenges';
import { effectiveLifecycleOf } from '../domain/challenge-state';
import { listChallengeParticipations } from '../repo/participations';
import { stripKeys } from '../repo/shared';
import { buildChallengeShareHtml } from './share';

export const discoveryRoutes = new Hono<AppEnv>();

const KNOWN_LIFECYCLES = ['draft', 'recruiting', 'preparing', 'active', 'completed', 'archived'];
/** 레거시 sortBy(popular/latest) → 신규 정렬 키 매핑 (탐색 v1: recent|deadline|popular) */
function resolveSortBy(raw: string | undefined): 'recent' | 'deadline' | 'popular' {
  const value = String(raw || '').toLowerCase();
  if (value === 'deadline') return 'deadline';
  if (value === 'recent' || value === 'latest') return 'recent';
  return 'popular'; // 레거시 기본값 승계
}

// 탐색 목록 — 카테고리·라이프사이클 필터 + 정렬 (기본: recruiting+active)
discoveryRoutes.get('/', async (c) => {
  const category = c.req.query('category') || undefined;
  const sortBy = resolveSortBy(c.req.query('sortBy') ?? c.req.query('sort'));
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20', 10) || 20, 1), 100);
  const lifecycleParam = c.req.query('lifecycle') || null;

  const lifecycles = lifecycleParam
    ? lifecycleParam.split(',').map((s) => s.trim()).filter((s) => KNOWN_LIFECYCLES.includes(s))
    : ['recruiting', 'active'];
  if (lifecycles.length === 0) {
    return fail(c, 400, 'INVALID_LIFECYCLE', '유효하지 않은 lifecycle 필터입니다');
  }

  const items = await queryDiscovery({ lifecycles, category, sortBy, limit });
  const now = new Date();
  // effectiveLifecycle: 워커(10분 주기) 사이의 지연을 표시에서 흡수 (time-policy R4)
  const challenges = items.map((item) => ({
    ...stripKeys(item),
    effectiveLifecycle: effectiveLifecycleOf(item, now),
  }));

  // 레거시 응답 바디 계약 유지 ({ challenges, total, filters })
  return ok(c, {
    challenges,
    total: challenges.length,
    filters: {
      category: category || 'all',
      sortBy,
      lifecycle: lifecycleParam || 'all',
    },
  });
});

// 챌린지 상세 (레거시 GET /challenges/{challengeId})
discoveryRoutes.get('/:challengeId', async (c) => {
  const challengeId = c.req.param('challengeId');
  const challenge = await getChallenge(challengeId);
  if (!challenge) {
    return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  }
  return ok(c, { ...stripKeys(challenge), effectiveLifecycle: effectiveLifecycleOf(challenge, new Date()) });
});

// 공유 링크 OG 페이지 (api 도메인 직접 접근용 별칭) — 실제 공유 링크는 /share/:id (앱 도메인 라우팅).
discoveryRoutes.get('/:challengeId/share', async (c) => {
  const challengeId = c.req.param('challengeId');
  const challenge = await getChallenge(challengeId).catch(() => null);
  c.header('Cache-Control', 'public, max-age=300');
  return c.html(buildChallengeShareHtml(challenge, challengeId));
});

// 챌린지 통계 (레거시 GET /challenges/{challengeId}/stats — 퍼블릭)
discoveryRoutes.get('/:challengeId/stats', async (c) => {
  const challengeId = c.req.param('challengeId');

  const challenge = await getChallenge(challengeId);
  if (!challenge) {
    return fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다');
  }

  const participants = await listChallengeParticipations(challengeId);

  const totalParticipants = participants.length;
  const activeParticipants = participants.filter((p) => p.status === 'active').length;
  const completedParticipants = participants.filter((p) => p.status === 'completed').length;
  const failedParticipants = participants.filter((p) => p.status === 'failed').length;

  const completionRate = totalParticipants > 0 ? (completedParticipants / totalParticipants) * 100 : 0;

  const totalScore = participants.reduce((sum, p) => sum + (p.score || 0), 0);
  const averageScore = totalParticipants > 0 ? totalScore / totalParticipants : 0;

  // Day별 완료율 (레거시 7일 고정 승계)
  const dayCompletionRates = Array.from({ length: 7 }, (_, day) => {
    const dayNumber = day + 1;
    const completedForDay = participants.filter((p) => {
      const dayProgress = p.progress?.find((pr: any) => pr.day === dayNumber);
      return dayProgress && dayProgress.status === 'success';
    }).length;

    return {
      day: dayNumber,
      completionRate: totalParticipants > 0 ? (completedForDay / totalParticipants) * 100 : 0,
      completedCount: completedForDay,
    };
  });

  const totalDelta = participants.reduce((sum, p) => sum + (p.deltaSum || 0), 0);
  const averageDelta = totalParticipants > 0 ? totalDelta / totalParticipants : 0;

  return ok(c, {
    challenge: {
      challengeId: challenge.challengeId,
      title: challenge.title,
      category: challenge.category,
    },
    stats: {
      totalParticipants,
      activeParticipants,
      completedParticipants,
      failedParticipants,
      completionRate: Math.round(completionRate * 10) / 10,
      averageScore: Math.round(averageScore * 10) / 10,
      averageDelta: Math.round(averageDelta),
      dayCompletionRates,
    },
  });
});
