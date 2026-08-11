/**
 * 링크 프리뷰(OG 태그) 파싱 — 순수 로직 (AWS 무의존).
 * 레거시: backend/services/verification/link-preview/index.ts 의 파싱/가드 블록 추출
 * (필드명·decodeHtml·정규식 동작 변경 금지). fetch/DNS 는 라우트가 수행한다.
 */
import net from 'node:net';

export interface LinkPreviewFields {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export const EMPTY_PREVIEW: LinkPreviewFields = {
  title: null,
  description: null,
  image: null,
  siteName: null,
};

// ── HTML 파싱 (레거시 동작 그대로) ─────────────────────────────────────────

export function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function getMetaContent(html: string, key: string, attr: 'property' | 'name'): string | null {
  const regex = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const altRegex = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${key}["'][^>]*>`, 'i');
  const match = html.match(regex) || html.match(altRegex);
  return match?.[1] ? decodeHtml(match[1]) : null;
}

export function getTitle(html: string): string | null {
  const ogTitle = getMetaContent(html, 'og:title', 'property');
  if (ogTitle) return ogTitle;

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch?.[1] ? decodeHtml(titleMatch[1]) : null;
}

export function toAbsoluteUrl(base: URL, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

/**
 * OG 태그 → 프리뷰 필드 (레거시 우선순위: og:* → description/name → title 태그).
 * OG 미제공 사이트를 위해 twitter:* 카드와 `<link rel="image_src">`를 보조 폴백으로 사용한다.
 */
export function parseLinkPreview(html: string, baseUrl: URL): LinkPreviewFields {
  const imageCandidate =
    getMetaContent(html, 'og:image', 'property') ||
    getMetaContent(html, 'og:image:url', 'property') ||
    getMetaContent(html, 'twitter:image', 'name') ||
    getMetaContent(html, 'twitter:image', 'property') ||
    getLinkHref(html, 'image_src');

  return {
    title: getTitle(html) || getMetaContent(html, 'twitter:title', 'name'),
    description:
      getMetaContent(html, 'og:description', 'property') ||
      getMetaContent(html, 'description', 'name') ||
      getMetaContent(html, 'twitter:description', 'name'),
    // siteName은 레거시대로 null 유지 — 호스트명 폴백은 카드(UI)가 담당
    siteName: getMetaContent(html, 'og:site_name', 'property'),
    image: toAbsoluteUrl(baseUrl, imageCandidate),
  };
}

/** `<link rel="image_src" href="...">` — OG 이전 세대 사이트의 대표 이미지 폴백 */
export function getLinkHref(html: string, rel: string): string | null {
  const regex = new RegExp(`<link[^>]*rel=["']${rel}["'][^>]*href=["']([^"']+)["'][^>]*>`, 'i');
  const altRegex = new RegExp(`<link[^>]*href=["']([^"']+)["'][^>]*rel=["']${rel}["'][^>]*>`, 'i');
  const match = html.match(regex) || html.match(altRegex);
  return match?.[1] ? decodeHtml(match[1]) : null;
}

// ── YouTube 전용 경로 (스크래핑 없이 확정적으로 제목/썸네일 확보) ──────────

/** youtu.be/<id>, youtube.com/watch?v=<id>, /shorts/<id>, /embed/<id> → videoId */
export function youtubeVideoId(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const isValid = (id: string | undefined): id is string => Boolean(id && /^[\w-]{11}$/.test(id));

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return isValid(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const vParam = parsed.searchParams.get('v');
    if (isValid(vParam ?? undefined)) return vParam;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') {
      return isValid(segments[1]) ? segments[1] : null;
    }
  }
  return null;
}

/** videoId → 썸네일 URL (항상 존재하는 hqdefault 사용) */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// ── SSRF 가드 (레거시 동작 그대로) ─────────────────────────────────────────

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

/** 허용 도메인 서픽스 검사 — 빈 allowlist 는 전체 허용 (레거시 정책) */
export function isHostAllowed(hostname: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const host = hostname.toLowerCase();
  return allowlist.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** 사설/루프백/링크로컬 주소 차단 — IP 가 아니면 차단 취급 (레거시 동작) */
export function isBlockedAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd')
    );
  }
  return true;
}
