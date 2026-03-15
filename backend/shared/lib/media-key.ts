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

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return sanitizePath(raw);
  }

  try {
    const parsed = new URL(raw);
    return sanitizePath(parsed.pathname);
  } catch {
    return null;
  }
}
