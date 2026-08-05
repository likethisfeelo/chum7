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

// 공유 링크 OG 페이지 — 크롤러(카톡·슬랙·페북 등)가 이 URL을 긁으면 챌린지별 OG 메타를 반환하고,
//  실제 사람 브라우저는 JS로 SPA 미리보기(APP_ORIGIN/preview/:id)로 이동시킨다.
//  SPA(index.html)는 모든 경로에 동일한 정적 OG를 주므로, 동적 OG는 이 서버 렌더 경로가 담당.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

discoveryRoutes.get('/:challengeId/share', async (c) => {
  const challengeId = c.req.param('challengeId');
  const appOrigin = (process.env.APP_ORIGIN || '').replace(/\/$/, '');
  const previewUrl = `${appOrigin}/preview/${encodeURIComponent(challengeId)}`;

  const brand = 'CHUM7 익명 챌린지 커뮤니티';
  let title = brand;
  let description = '7일 챌린지에 함께 도전해요.';
  let image = appOrigin ? `${appOrigin}/og-image.png` : '';

  const challenge = await getChallenge(challengeId).catch(() => null);
  if (challenge) {
    // 요구사항: '챌린지 제목'이 앞, 'CHUM7 익명 챌린지 커뮤니티'가 뒤.
    const t = typeof challenge.title === 'string' ? challenge.title.trim() : '';
    if (t) title = `${t} · ${brand}`;
    const d = typeof challenge.description === 'string' ? challenge.description.trim() : '';
    if (d) description = d.length > 200 ? `${d.slice(0, 200)}…` : d;
    if (typeof challenge.coverImageUrl === 'string' && challenge.coverImageUrl.trim()) {
      image = challenge.coverImageUrl.trim();
    }
  }

  const eTitle = escapeHtml(title);
  const eDesc = escapeHtml(description);
  const eImage = escapeHtml(image);
  const eUrl = escapeHtml(previewUrl);

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${eTitle}</title>
<meta name="description" content="${eDesc}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="CHUM7" />
<meta property="og:title" content="${eTitle}" />
<meta property="og:description" content="${eDesc}" />
<meta property="og:url" content="${eUrl}" />
${eImage ? `<meta property="og:image" content="${eImage}" />` : ''}
<meta property="og:locale" content="ko_KR" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${eTitle}" />
<meta name="twitter:description" content="${eDesc}" />
${eImage ? `<meta name="twitter:image" content="${eImage}" />` : ''}
<script>window.location.replace(${JSON.stringify(previewUrl)});</script>
</head>
<body>
<p>이동 중이에요… 자동으로 넘어가지 않으면 <a href="${eUrl}">여기</a>를 눌러주세요.</p>
</body>
</html>`;

  // 공유 미리보기 캐시(5분). 챌린지가 없어도 기본 OG로 200 반환(링크 깨짐 방지).
  c.header('Cache-Control', 'public, max-age=300');
  return c.html(html);
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
