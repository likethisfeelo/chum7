export function extractImageS3Key(url?: string | null): string | null {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;

  const sanitizePath = (input: string): string | null => {
    const noQuery = input.split('?')[0].split('#')[0];
    const withoutLeading = noQuery.replace(/^\/+/, '');
    const withoutUploads = withoutLeading.startsWith('uploads/')
      ? withoutLeading.slice('uploads/'.length)
      : withoutLeading;
    if (!withoutUploads) return null;

    try {
      return decodeURIComponent(withoutUploads);
    } catch {
      return withoutUploads;
    }
  };

  if (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('//')) {
    return sanitizePath(raw);
  }

  try {
    const normalizedUrl = raw.startsWith('//') ? `https:${raw}` : raw;
    const parsed = new URL(normalizedUrl);
    const host = String(parsed.hostname || '').toLowerCase();
    const pathname = parsed.pathname || '';

    if (pathname.startsWith('/uploads/')) {
      return sanitizePath(pathname);
    }

    const isKnownStorageHost =
      host.includes('amazonaws.com') ||
      host.includes('cloudfront.net') ||
      host.includes('chum7.com');

    if (!isKnownStorageHost) return null;

    return sanitizePath(pathname);
  } catch {
    return null;
  }
}


export function isLikelySignedAssetUrl(url?: string | null): boolean {
  if (!url) return false;
  const raw = String(url).trim();
  if (!raw) return false;

  try {
    const normalizedUrl = raw.startsWith('//') ? `https:${raw}` : raw;
    const parsed = new URL(normalizedUrl);
    const keys = new Set(Array.from(parsed.searchParams.keys()).map((k) => k.toLowerCase()));

    const hasAmzSignature = keys.has('x-amz-signature');
    const hasAmzAlgorithm = keys.has('x-amz-algorithm');
    const hasLegacySignature = keys.has('signature') && keys.has('expires');

    return hasAmzSignature || hasAmzAlgorithm || hasLegacySignature;
  } catch {
    return false;
  }
}
