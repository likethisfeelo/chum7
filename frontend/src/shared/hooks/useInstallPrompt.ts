import { useSyncExternalStore } from 'react';
import {
  canPromptInstall,
  isInstalled,
  isIOS,
  isStandalone,
  promptInstall,
  subscribeInstallState,
} from '@/shared/pwa/installPrompt';

/**
 * PWA 설치 상태 훅.
 * - canInstall: 네이티브 설치 프롬프트를 바로 띄울 수 있음(Android/데스크톱 Chromium)
 * - installed: 이미 홈 화면 앱으로 설치/실행 중
 * - ios: iOS Safari(수동 안내 필요)
 * - promptInstall(): 네이티브 설치 프롬프트 실행
 */
export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(subscribeInstallState, canPromptInstall, () => false);
  const installed = useSyncExternalStore(subscribeInstallState, isInstalled, () => false);

  return {
    canInstall,
    installed,
    ios: isIOS(),
    standalone: isStandalone(),
    promptInstall,
  };
}
