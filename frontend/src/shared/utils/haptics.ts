/**
 * 햅틱(진동) 피드백 단일 진입점 — 인터랙션 연출용.
 *  - 네이티브 앱 셸(향후): window.chum7Native.haptic(type) 주입 시 네이티브 햅틱
 *    (iOS UIImpactFeedbackGenerator / Android Vibrator)으로 위임 — 웹 코드 수정 불필요
 *  - Android Chrome 웹/PWA: Vibration API 폴백
 *  - iOS Safari·데스크톱: 미지원 → 조용히 무시 (호출부는 신경 쓸 필요 없음)
 * externalLink.ts 의 chum7Native 브리지와 같은 패턴.
 */
export type HapticType = 'tap' | 'success' | 'warning';

const VIBRATE_PATTERNS: Record<HapticType, number | number[]> = {
  tap: 10,
  success: [15, 60, 25],
  warning: [40, 80, 40],
};

export function haptic(type: HapticType = 'tap'): void {
  try {
    const native = (window as unknown as {
      chum7Native?: { haptic?: (type: string) => void };
    }).chum7Native;
    if (native?.haptic) {
      native.haptic(type);
      return;
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(VIBRATE_PATTERNS[type]);
    }
  } catch {
    // 미지원 환경 — 무시
  }
}
