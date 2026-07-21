import { create } from 'zustand';
import { getPushSupport } from './push';

/**
 * 푸시 권한 요청 시트 상태 (PRODUCT_SPEC §4.10).
 * 요청 시점: 가입 직후가 아니라 "첫 응원 예약 완료 직후" — 인증 성공 응답의
 * cheerOpportunity(응원 자동 예약) 지점에서 maybeOpenPushPrompt() 를 호출한다.
 * localStorage 'pushPromptShown' 으로 1회만 노출한다.
 */

const PROMPT_FLAG_KEY = 'pushPromptShown';

interface PushPromptState {
  open: boolean;
  needsInstall: boolean; // iOS 미설치 — 구독 대신 홈 화면 추가 안내
  openSheet: (needsInstall: boolean) => void;
  closeSheet: () => void;
}

export const usePushPromptStore = create<PushPromptState>((set) => ({
  open: false,
  needsInstall: false,
  openSheet: (needsInstall) => set({ open: true, needsInstall }),
  closeSheet: () => set({ open: false }),
}));

export function markPushPromptShown(): void {
  try {
    localStorage.setItem(PROMPT_FLAG_KEY, '1');
  } catch {
    // storage 불가 환경은 무시
  }
}

/** 첫 응원 예약 완료 직후 호출 — 조건이 맞을 때만 시트를 연다 */
export function maybeOpenPushPrompt(): void {
  try {
    if (localStorage.getItem(PROMPT_FLAG_KEY)) return;
  } catch {
    return;
  }

  const support = getPushSupport();
  if (support === 'unsupported') return;
  // 이미 허용/거부한 사용자에게는 다시 묻지 않는다
  if (support === 'supported' && Notification.permission !== 'default') {
    markPushPromptShown();
    return;
  }

  usePushPromptStore.getState().openSheet(support === 'needs-install');
}
