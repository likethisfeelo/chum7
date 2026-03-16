export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';

  const raw = String(url).trim();
  if (!raw) return '';

  const cloudfrontBase = (import.meta.env.VITE_CLOUDFRONT_URL || '').replace(/\/+$/, '');
  const normalizedPath = raw.replace(/^\/+/, '');

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();

      // Already on a CDN domain (chum7.com or cloudfront.net) with /uploads/ path
      // → preserve original domain (do not rewrite to VITE_CLOUDFRONT_URL)
      if (
        (host.includes('chum7.com') || host.includes('cloudfront.net')) &&
        parsed.pathname.startsWith('/uploads/')
      ) {
        return `https://${parsed.host}${parsed.pathname}`;
      }

      // S3 or other origin URL with /uploads/ path → rewrite to configured CDN
      if (!cloudfrontBase) return raw;
      if (parsed.pathname.startsWith('/uploads/')) {
        return `${cloudfrontBase}${parsed.pathname}`;
      }
      return raw;
    } catch {
      return raw;
    }
  }

  if (normalizedPath.startsWith('uploads/')) {
    return cloudfrontBase
      ? `${cloudfrontBase}/${normalizedPath}`
      : `/${normalizedPath}`;
  }

  return cloudfrontBase
    ? `${cloudfrontBase}/uploads/${normalizedPath}`
    : `/uploads/${normalizedPath}`;
}

