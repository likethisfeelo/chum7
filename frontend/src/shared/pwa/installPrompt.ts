/**
 * PWA 설치(홈 화면에 추가) 프롬프트 관리 — 싱글턴.
 *
 * `beforeinstallprompt` 이벤트는 앱 로드 직후 한 번 발생하며, 사용자가
 * 원할 때(설치 버튼 클릭) 다시 띄우려면 그 이벤트를 붙잡아 두어야 한다.
 * 컴포넌트 마운트보다 먼저 발생할 수 있으므로 이 모듈을 앱 진입점(main.tsx)에서
 * import 하여 리스너를 최대한 일찍 등록한다.
 */

// 표준 타입에 아직 포함되지 않은 beforeinstallprompt 이벤트.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

/** iOS(Safari)는 beforeinstallprompt를 지원하지 않아 수동 안내가 필요하다. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIphoneIpad = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ 는 데스크톱 UA로 위장하므로 터치+Mac 조합도 iOS로 취급
  const isIpadOS = /macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  return isIphoneIpad || isIpadOS;
}

/** 이미 홈 화면 앱(스탠드얼론)으로 실행 중인지. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  // iOS Safari 전용 플래그
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(displayModeStandalone || iosStandalone);
}

/** 네이티브 설치 프롬프트를 즉시 띄울 수 있는 상태인지. */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export function isInstalled(): boolean {
  return installed || isStandalone();
}

/**
 * 네이티브 설치 프롬프트를 띄운다.
 * @returns 프롬프트가 실제로 뜨고 사용자가 수락했으면 true.
 */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const evt = deferredPrompt;
  await evt.prompt();
  const choice = await evt.userChoice;
  // prompt 는 1회용 — 사용 후 폐기
  deferredPrompt = null;
  notify();
  return choice.outcome === 'accepted';
}

/** 상태 변경 구독. 반환된 함수로 구독 해제. */
export function subscribeInstallState(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 앱 진입점에서 1회 호출 — 전역 리스너 등록. */
export function initInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}
