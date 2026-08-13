/**
 * 유튜브 URL → videoId / 썸네일.
 * 링크 프리뷰 API가 실패하거나 아직 캐시되지 않았을 때도 유튜브 링크만큼은
 * 클라이언트에서 썸네일을 즉시 만들 수 있게 한다.
 * (서버 domain/link-preview.ts 의 youtubeVideoId 와 동일 규칙 — 함께 유지)
 */

const VIDEO_ID = /^[\w-]{11}$/;

export function youtubeVideoId(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id && VIDEO_ID.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = parsed.searchParams.get('v');
    if (v && VIDEO_ID.test(v)) return v;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') {
      const id = segments[1];
      return id && VIDEO_ID.test(id) ? id : null;
    }
  }
  return null;
}

export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
