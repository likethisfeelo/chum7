/**
 * 링크 프리뷰 프록시 — GET /public/link-preview?url=
 * 레거시: backend/services/verification/link-preview/index.ts (응답 필드
 * `{ title, description, image, siteName, url }`·에러 코드 승계).
 * 신규 정책: https 전용 + DNS 사설망 차단(레거시) + 3초 타임아웃 + 512KB 캡 + text/html 만.
 */
import dns from 'node:dns/promises';
import { TextDecoder } from 'node:util';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import {
  EMPTY_PREVIEW,
  isBlockedAddress,
  isHostAllowed,
  parseAllowlist,
  parseLinkPreview,
  youtubeThumbnail,
  youtubeVideoId,
  type LinkPreviewFields,
} from '../domain/link-preview';

export const linkPreviewRoutes = new Hono<AppEnv>();

const querySchema = z.object({
  url: z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS_ONLY'),
});

const FETCH_TIMEOUT_MS = 3000;
const MAX_HTML_BYTES = 512 * 1024;

type LinkPreview = LinkPreviewFields & { url: string };

// 프로세스 내 캐시 (레거시 승계 — Lambda 웜 컨테이너 한정)
const CACHE = new Map<string, { data: LinkPreview; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 500;

function getCached(url: string): LinkPreview | null {
  const cached = CACHE.get(url);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    CACHE.delete(url);
    return null;
  }
  return cached.data;
}

function putCache(url: string, data: LinkPreview): void {
  if (CACHE.size >= CACHE_LIMIT) {
    const first = CACHE.keys().next().value;
    if (first) CACHE.delete(first);
  }
  CACHE.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * YouTube 전용 경로 — HTML 스크래핑은 동의/봇 페이지가 섞여 실패율이 높다.
 * 공개 oEmbed(제목·채널)로 확정 조회하고, 실패해도 videoId 기반 썸네일은 항상 채운다.
 */
async function fetchYoutubePreview(url: string, videoId: string): Promise<LinkPreview> {
  const fallback: LinkPreview = {
    title: null,
    description: null,
    image: youtubeThumbnail(videoId),
    siteName: 'YouTube',
    url,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`;
    const res = await fetch(endpoint, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
    return {
      title: typeof body.title === 'string' ? body.title : null,
      description: typeof body.author_name === 'string' ? body.author_name : null,
      image: typeof body.thumbnail_url === 'string' ? body.thumbnail_url : youtubeThumbnail(videoId),
      siteName: 'YouTube',
      url,
    };
  } catch {
    return fallback; // 타임아웃/파싱 실패 — 썸네일만이라도 노출
  } finally {
    clearTimeout(timeout);
  }
}

/** https + 사설망/allowlist 검사 (레거시 assertSafeOutboundUrl 승계) */
async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') throw new Error('UNSUPPORTED_PROTOCOL');
  if (!parsed.hostname || parsed.hostname === 'localhost') throw new Error('BLOCKED_HOST');
  if (!isHostAllowed(parsed.hostname, parseAllowlist(process.env.LINK_PREVIEW_ALLOWLIST))) {
    throw new Error('HOST_NOT_ALLOWED');
  }

  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length) throw new Error('DNS_RESOLVE_FAILED');
  if (addresses.some((addr) => isBlockedAddress(addr.address))) throw new Error('BLOCKED_HOST');

  return parsed;
}

/** 응답 바디를 512KB 캡으로 읽는다 (초과분 절단 — OG 태그는 <head> 에 있음) */
async function readBodyCapped(res: Response, capBytes: number): Promise<string> {
  const body = res.body as unknown as AsyncIterable<Uint8Array> | null;
  if (!body) return '';
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let html = '';
  let bytes = 0;
  for await (const chunk of body) {
    bytes += chunk.byteLength;
    html += decoder.decode(chunk, { stream: true });
    if (bytes >= capBytes) break;
  }
  return html;
}

linkPreviewRoutes.get('/', async (c) => {
  let url: string;
  try {
    ({ url } = querySchema.parse({ url: c.req.query('url') }));
  } catch {
    return fail(c, 400, 'VALIDATION_ERROR', 'https URL 쿼리 파라미터가 필요합니다');
  }

  const cached = getCached(url);
  if (cached) {
    return c.json({ success: true, data: cached, cached: true }, 200);
  }

  try {
    const safeUrl = await assertSafeOutboundUrl(url);

    // YouTube는 oEmbed 경로로 우회 (스크래핑 실패율 회피)
    const videoId = youtubeVideoId(url);
    if (videoId) {
      const preview = await fetchYoutubePreview(url, videoId);
      putCache(url, preview);
      return ok(c, preview);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html = '';
    try {
      const res = await fetch(safeUrl.toString(), {
        method: 'GET',
        headers: {
          // 정체를 밝히되 Mozilla 호환 형식 — 순수 봇 UA를 거절하는 사이트가 많다
          'User-Agent': 'Mozilla/5.0 (compatible; chum7-link-preview-bot/1.0)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
      if (!res.ok || !isHtml) {
        // 실패/비 HTML 도 nulls 로 성공 응답 (레거시 !res.ok 분기 승계)
        const data: LinkPreview = { ...EMPTY_PREVIEW, url };
        putCache(url, data);
        return ok(c, data);
      }
      html = await readBodyCapped(res, MAX_HTML_BYTES);
    } finally {
      clearTimeout(timeout);
    }

    const data: LinkPreview = { ...parseLinkPreview(html, new URL(url)), url };
    putCache(url, data);
    return ok(c, data);
  } catch (error) {
    const err = error as { name?: string; message?: string };
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      // 레거시 타임아웃 분기: nulls + timeout 플래그 (성공 envelope)
      return ok(c, { ...EMPTY_PREVIEW, timeout: true });
    }
    if (
      err?.message === 'UNSUPPORTED_PROTOCOL' ||
      err?.message === 'BLOCKED_HOST' ||
      err?.message === 'HOST_NOT_ALLOWED'
    ) {
      return fail(c, 400, 'INVALID_URL', '허용되지 않은 URL입니다');
    }
    console.error('link preview error', error);
    return fail(c, 500, 'INTERNAL_SERVER_ERROR', '링크 미리보기를 불러오지 못했습니다');
  }
});
