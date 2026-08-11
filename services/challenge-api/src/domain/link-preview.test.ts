import {
  decodeHtml,
  getMetaContent,
  getTitle,
  isBlockedAddress,
  isHostAllowed,
  isPrivateIPv4,
  parseAllowlist,
  parseLinkPreview,
  toAbsoluteUrl,
  youtubeThumbnail,
  youtubeVideoId,
} from './link-preview';

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>페이지 &lt;타이틀&gt;</title>
  <meta property="og:title" content="첨언 7일 챌린지 &amp; 기록" />
  <meta property="og:description" content="7일간의 짧고 강렬한 도전" />
  <meta property="og:site_name" content="chum7" />
  <meta property="og:image" content="/images/og-cover.png" />
</head>
<body>본문</body>
</html>`;

const NO_OG_HTML = `
<html><head><title>일반 페이지</title>
<meta name="description" content="메타 설명입니다"></head><body></body></html>`;

describe('link-preview OG 파싱', () => {
  const base = new URL('https://example.com/articles/1');

  it('og 태그를 우선 추출하고 HTML 엔티티를 디코드한다', () => {
    const preview = parseLinkPreview(SAMPLE_HTML, base);
    expect(preview.title).toBe('첨언 7일 챌린지 & 기록');
    expect(preview.description).toBe('7일간의 짧고 강렬한 도전');
    expect(preview.siteName).toBe('chum7');
  });

  it('og:image 상대 경로를 절대 URL 로 변환한다', () => {
    const preview = parseLinkPreview(SAMPLE_HTML, base);
    expect(preview.image).toBe('https://example.com/images/og-cover.png');
  });

  it('og:title 이 없으면 <title> 태그로 폴백한다', () => {
    const preview = parseLinkPreview(NO_OG_HTML, base);
    expect(preview.title).toBe('일반 페이지');
    expect(preview.description).toBe('메타 설명입니다');
    expect(preview.siteName).toBeNull();
    expect(preview.image).toBeNull();
  });

  it('메타 태그가 전혀 없으면 모든 필드 null', () => {
    const preview = parseLinkPreview('<html><body>no meta</body></html>', base);
    expect(preview).toEqual({ title: null, description: null, image: null, siteName: null });
  });

  it('content 가 attr 앞에 오는 순서도 매칭한다 (altRegex)', () => {
    const html = '<meta content="역순 콘텐츠" property="og:title">';
    expect(getMetaContent(html, 'og:title', 'property')).toBe('역순 콘텐츠');
  });

  it('decodeHtml — 기본 엔티티 5종', () => {
    expect(decodeHtml('&amp;&lt;&gt;&quot;&#39; 끝 ')).toBe('&<>"\' 끝');
  });

  it('getTitle — title 태그 엔티티 디코드', () => {
    expect(getTitle('<title>A &amp; B</title>')).toBe('A & B');
  });

  it('toAbsoluteUrl — 잘못된 입력은 null', () => {
    expect(toAbsoluteUrl(new URL('https://a.com'), null)).toBeNull();
    expect(toAbsoluteUrl(new URL('https://a.com'), 'http://[bad')).toBeNull();
  });
});

describe('link-preview 폴백 메타 (OG 미제공 사이트)', () => {
  const base = new URL('https://example.com/a');

  it('og 없으면 twitter 카드로 폴백한다', () => {
    const html = `<meta name="twitter:title" content="트위터 제목">
      <meta name="twitter:image" content="https://cdn.example.com/t.png">
      <meta name="twitter:description" content="트위터 설명">`;
    const preview = parseLinkPreview(html, base);
    expect(preview.title).toBe('트위터 제목');
    expect(preview.image).toBe('https://cdn.example.com/t.png');
    expect(preview.description).toBe('트위터 설명');
  });

  it('link rel=image_src 를 이미지 폴백으로 쓴다', () => {
    const html = '<link rel="image_src" href="/legacy.png">';
    expect(parseLinkPreview(html, base).image).toBe('https://example.com/legacy.png');
  });

  it('og:image 가 twitter:image 보다 우선한다', () => {
    const html = `<meta property="og:image" content="/og.png">
      <meta name="twitter:image" content="/tw.png">`;
    expect(parseLinkPreview(html, base).image).toBe('https://example.com/og.png');
  });
});

describe('youtubeVideoId (oEmbed 우회 경로 판정)', () => {
  it('youtu.be 단축 링크', () => {
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ');
  });

  it('watch/shorts/embed 경로', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('유튜브가 아니거나 id 형식이 아니면 null', () => {
    expect(youtubeVideoId('https://vimeo.com/12345')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/results?search_query=a')).toBeNull();
    expect(youtubeVideoId('https://youtu.be/short')).toBeNull();
    expect(youtubeVideoId('not-a-url')).toBeNull();
  });

  it('썸네일 URL 은 videoId 기반으로 항상 생성된다', () => {
    expect(youtubeThumbnail('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });
});

describe('link-preview SSRF 가드', () => {
  it('사설/루프백 IPv4 대역을 차단한다', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '0.0.0.0', '169.254.1.1', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
      expect(isPrivateIPv4(ip)).toBe(true);
    }
    expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateIPv4('not-an-ip')).toBe(true);
  });

  it('isBlockedAddress — IPv6 루프백/링크로컬/ULA 차단, 공인 IP 허용', () => {
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('fd00::1')).toBe(true);
    expect(isBlockedAddress('2001:4860:4860::8888')).toBe(false);
    expect(isBlockedAddress('1.2.3.4')).toBe(false);
    expect(isBlockedAddress('garbage')).toBe(true);
  });

  it('allowlist — 빈 목록은 전체 허용, 서픽스 매칭', () => {
    expect(isHostAllowed('anything.com', [])).toBe(true);
    const list = parseAllowlist(' Example.com , blog.co ');
    expect(isHostAllowed('example.com', list)).toBe(true);
    expect(isHostAllowed('sub.example.com', list)).toBe(true);
    expect(isHostAllowed('notexample.com', list)).toBe(false);
  });
});
