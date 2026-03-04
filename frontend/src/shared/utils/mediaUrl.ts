export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';

  const raw = String(url).trim();
  if (!raw) return '';

  const cloudfrontBase = (import.meta.env.VITE_CLOUDFRONT_URL || '').replace(/\/+$/, '');
  const normalizedPath = raw.replace(/^\/+/, '');

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    if (!cloudfrontBase) return raw;

    try {
      const parsed = new URL(raw);
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

