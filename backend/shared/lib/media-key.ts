export function extractImageS3Key(url?: string | null): string | null {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    if (raw.startsWith('/uploads/')) return raw.slice('/uploads/'.length);
    if (raw.startsWith('uploads/')) return raw.slice('uploads/'.length);
    return raw.replace(/^\/+/, '') || null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith('/uploads/')) {
      return parsed.pathname.slice('/uploads/'.length);
    }

    const pathKey = parsed.pathname.replace(/^\/+/, '');
    if (pathKey) return pathKey;
  } catch {
    return null;
  }

  return null;
}
