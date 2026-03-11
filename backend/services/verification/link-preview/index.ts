import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import dns from 'node:dns/promises';
import net from 'node:net';

const querySchema = z.object({
  url: z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS_ONLY'),
});

type LinkPreview = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
};

const LINK_PREVIEW_CACHE = new Map<string, { data: LinkPreview; expiresAt: number }>();
const LINK_PREVIEW_TTL_MS = 10 * 60 * 1000;
const LINK_PREVIEW_CACHE_LIMIT = 500;

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

function getAllowedDomainSuffixes(): string[] {
  return (process.env.LINK_PREVIEW_ALLOWLIST || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function isHostAllowed(hostname: string): boolean {
  const allowlist = getAllowedDomainSuffixes();
  if (allowlist.length === 0) return true;
  const host = hostname.toLowerCase();
  return allowlist.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd');
  }
  return true;
}

function getCachedPreview(url: string): LinkPreview | null {
  const cached = LINK_PREVIEW_CACHE.get(url);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    LINK_PREVIEW_CACHE.delete(url);
    return null;
  }
  return cached.data;
}

function cachePreview(url: string, data: LinkPreview): void {
  if (LINK_PREVIEW_CACHE.size >= LINK_PREVIEW_CACHE_LIMIT) {
    const first = LINK_PREVIEW_CACHE.keys().next().value;
    if (first) LINK_PREVIEW_CACHE.delete(first);
  }
  LINK_PREVIEW_CACHE.set(url, { data, expiresAt: Date.now() + LINK_PREVIEW_TTL_MS });
}

async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error('UNSUPPORTED_PROTOCOL');
  }

  if (!parsed.hostname || parsed.hostname === 'localhost') {
    throw new Error('BLOCKED_HOST');
  }

  if (!isHostAllowed(parsed.hostname)) {
    throw new Error('HOST_NOT_ALLOWED');
  }

  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length) throw new Error('DNS_RESOLVE_FAILED');

  if (addresses.some((addr) => isBlockedAddress(addr.address))) {
    throw new Error('BLOCKED_HOST');
  }

  return parsed;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function getMetaContent(html: string, key: string, attr: 'property' | 'name'): string | null {
  const regex = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const altRegex = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${key}["'][^>]*>`, 'i');
  const match = html.match(regex) || html.match(altRegex);
  return match?.[1] ? decodeHtml(match[1]) : null;
}

function getTitle(html: string): string | null {
  const ogTitle = getMetaContent(html, 'og:title', 'property');
  if (ogTitle) return ogTitle;

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch?.[1] ? decodeHtml(titleMatch[1]) : null;
}

function toAbsoluteUrl(base: URL, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const { url } = querySchema.parse(event.queryStringParameters || {});

    const cached = getCachedPreview(url);
    if (cached) {
      return response(200, { success: true, data: cached, cached: true });
    }

    const safeUrl = await assertSafeOutboundUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    let html = '';
    try {
      const res = await fetch(safeUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'chum7-link-preview-bot/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const data: LinkPreview = { title: null, description: null, image: null, siteName: null, url };
        cachePreview(url, data);
        return response(200, { success: true, data });
      }
      html = await res.text();
    } finally {
      clearTimeout(timeout);
    }

    const data: LinkPreview = {
      title: getTitle(html),
      description: getMetaContent(html, 'og:description', 'property') || getMetaContent(html, 'description', 'name'),
      siteName: getMetaContent(html, 'og:site_name', 'property'),
      image: toAbsoluteUrl(safeUrl, getMetaContent(html, 'og:image', 'property')),
      url,
    };

    cachePreview(url, data);
    return response(200, { success: true, data });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', message: 'https URL 쿼리 파라미터가 필요합니다' });
    }

    if (error?.name === 'AbortError') {
      return response(200, { success: true, data: { title: null, description: null, image: null, siteName: null, timeout: true } });
    }

    if (error?.message === 'UNSUPPORTED_PROTOCOL' || error?.message === 'BLOCKED_HOST' || error?.message === 'HOST_NOT_ALLOWED') {
      return response(400, { error: 'INVALID_URL', message: '허용되지 않은 URL입니다' });
    }

    console.error('link preview error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '링크 미리보기를 불러오지 못했습니다' });
  }
};
