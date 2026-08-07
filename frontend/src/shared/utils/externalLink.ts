/**
 * 외부 링크 열기 단일 진입점 — 챌린지 가이드 등 사용자 작성 콘텐츠의 링크는 전부 이걸 통한다.
 *  - 웹(데스크톱/모바일 브라우저): 새 탭 (noopener — SPA 이탈·탭재빙 방지)
 *  - PWA(홈 화면 설치): OS 기본 동작 = iOS 인앱 Safari 시트 / Android Chrome 커스텀 탭
 *  - 네이티브 앱 래퍼(향후): 앱 셸이 window.chum7Native.openInAppBrowser를 주입하면
 *    인앱 브라우저(SFSafariViewController / Chrome Custom Tabs)로 열린다.
 */
export function openExternalUrl(url: string): void {
  const raw = String(url || '').trim();
  if (!/^https?:\/\//i.test(raw)) return; // javascript: 등 위험 스킴 차단

  const native = (window as unknown as {
    chum7Native?: { openInAppBrowser?: (url: string) => void };
  }).chum7Native;
  if (native?.openInAppBrowser) {
    native.openInAppBrowser(raw);
    return;
  }
  window.open(raw, '_blank', 'noopener,noreferrer');
}

/** 컨테이너 onClickCapture용 — 내부 앵커 클릭을 가로채 openExternalUrl로 라우팅 */
export function interceptAnchorClick(e: import('react').MouseEvent<HTMLElement>): void {
  const anchor = (e.target as HTMLElement).closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href') || '';
  if (!/^https?:\/\//i.test(href)) return;
  e.preventDefault();
  e.stopPropagation();
  openExternalUrl(href);
}
