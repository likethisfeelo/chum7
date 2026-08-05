/**
 * 로그인 성공 후 이동할 경로 — URL의 ?redirect= 파라미터를 사용(공유 링크 참여 플로우).
 * 오픈 리다이렉트 방지: 내부 절대경로('/...')만 허용하고 '//'(프로토콜 상대)나 외부 URL은 무시.
 */
export function getPostLoginRedirect(fallback = '/me'): string {
  try {
    const raw = new URLSearchParams(window.location.search).get('redirect');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  } catch {
    /* URL 파싱 실패 시 폴백 */
  }
  return fallback;
}
