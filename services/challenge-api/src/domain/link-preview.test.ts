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
