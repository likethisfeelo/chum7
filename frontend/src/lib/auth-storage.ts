/**
 * 로그아웃/토큰 만료 시 localStorage 정리 — 인증·캐시는 지우되,
 * "한 번 봤음" 류 UI 기록은 보존한다. 무차별 clear()가 recapSeen: 키를 지워
 * 리캡 바텀시트가 로그인할 때마다 다시 뜨던 문제의 원인.
 */
const PRESERVED_PREFIXES = [
  'recapSeen:', // 챌린지 종료 리캡 1회 노출 기록 (recapStore)
  'remedyPrompt:', // 보완인증 유도 시트 노출 횟수 (RemedyPromptSheet)
];

export function clearAuthStorage(): void {
  try {
    const preserved: Array<[string, string]> = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && PRESERVED_PREFIXES.some((p) => key.startsWith(p))) {
        const value = localStorage.getItem(key);
        if (value !== null) preserved.push([key, value]);
      }
    }
    localStorage.clear();
    for (const [key, value] of preserved) localStorage.setItem(key, value);
  } catch {
    // 스토리지 접근 불가 환경 — 무시
  }
}
