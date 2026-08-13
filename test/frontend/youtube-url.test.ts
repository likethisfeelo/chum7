import { youtubeThumbnail, youtubeVideoId } from '../../frontend/src/shared/utils/youtube';

/**
 * 링크 프리뷰 API가 실패해도 유튜브 링크는 클라이언트에서 썸네일을 만든다.
 * 서버 services/challenge-api/src/domain/link-preview.ts 의 동일 함수와 규칙을 맞춘다.
 */
describe('youtubeVideoId (클라이언트 폴백)', () => {
  it('youtu.be 단축 링크 — 쿼리 유무 무관', () => {
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ');
  });

  it('watch / shorts / embed / live 경로', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('유튜브가 아니거나 형식이 다르면 null', () => {
    expect(youtubeVideoId('https://vimeo.com/12345')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/results?search_query=a')).toBeNull();
    expect(youtubeVideoId('https://youtu.be/short')).toBeNull();
    expect(youtubeVideoId('not-a-url')).toBeNull();
    expect(youtubeVideoId(null)).toBeNull();
    expect(youtubeVideoId(undefined)).toBeNull();
  });

  it('썸네일 URL 생성', () => {
    expect(youtubeThumbnail('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });
});
