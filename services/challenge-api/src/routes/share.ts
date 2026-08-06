/**
 * 공유 링크 OG 페이지 — /share/:challengeId
 *  크롤러(카톡·슬랙·페북 등)가 이 URL을 긁으면 챌린지별 OG 메타를 반환하고,
 *  실제 사람 브라우저는 JS로 SPA 미리보기(APP_ORIGIN/preview/:id)로 이동한다.
 *  앱 배포(CloudFront)에서 www.chum7.com/share/* → API 오리진으로 라우팅되어,
 *  공유 링크가 앱과 같은 도메인(www)으로 보이게 한다.
 *
 * SPA(index.html)는 모든 경로에 동일한 정적 OG를 주므로, 동적 OG는 이 서버 렌더 경로가 담당한다.
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { getChallenge } from '../repo/challenges';

const BRAND = 'CHUM7 익명 챌린지 커뮤니티';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 챌린지(없으면 null)로 OG 메타가 담긴 HTML 문서를 만든다. 사람은 previewUrl로 자동 이동. */
export function buildChallengeShareHtml(
  challenge: Record<string, any> | null | undefined,
  challengeId: string,
): string {
  const appOrigin = (process.env.APP_ORIGIN || '').replace(/\/$/, '');
  const previewUrl = `${appOrigin}/preview/${encodeURIComponent(challengeId)}`;

  // 요구사항: '챌린지 제목'이 앞, 'CHUM7 익명 챌린지 커뮤니티'가 뒤.
  let title = BRAND;
  let description = '7일 챌린지에 함께 도전해요.';
  let image = appOrigin ? `${appOrigin}/og-image.png` : '';
  if (challenge) {
    // 종료(완주·보관·리더 해산)된 챌린지는 카드에 '종료된 챌린지입니다.' 표시.
    const lifecycle = typeof challenge.lifecycle === 'string' ? challenge.lifecycle : '';
    const isEnded = lifecycle === 'completed' || lifecycle === 'archived' || challenge.disbanded === true;
    const t = typeof challenge.title === 'string' ? challenge.title.trim() : '';
    if (t) title = isEnded ? `[종료] ${t} · ${BRAND}` : `${t} · ${BRAND}`;
    if (isEnded) {
      description = '종료된 챌린지입니다.';
    } else {
      const d = typeof challenge.description === 'string' ? challenge.description.trim() : '';
      if (d) description = d.length > 200 ? `${d.slice(0, 200)}…` : d;
    }
    if (typeof challenge.coverImageUrl === 'string' && challenge.coverImageUrl.trim()) {
      image = challenge.coverImageUrl.trim();
    } else if (Array.isArray(challenge.rewardProducts)) {
      // 커버 이미지가 없으면 완주 보상 상품 이미지를 OG 이미지로 폴백
      const withImage = challenge.rewardProducts.find(
        (p: any) => typeof p?.imageUrl === 'string' && p.imageUrl.trim(),
      );
      if (withImage) image = String(withImage.imageUrl).trim();
    }
  }

  const eTitle = escapeHtml(title);
  const eDesc = escapeHtml(description);
  const eImage = escapeHtml(image);
  const eUrl = escapeHtml(previewUrl);

  return `<!doctype html>
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
}

export const shareRoutes = new Hono<AppEnv>();

shareRoutes.get('/:challengeId', async (c) => {
  const challengeId = c.req.param('challengeId');
  const challenge = await getChallenge(challengeId).catch(() => null);
  // 공유 미리보기 캐시(5분). 챌린지가 없어도 기본 OG로 200 반환(링크 깨짐 방지).
  c.header('Cache-Control', 'public, max-age=300');
  return c.html(buildChallengeShareHtml(challenge, challengeId));
});
