import { create } from 'zustand';

/**
 * 챌린지 종료 리캡(다정한 회고) 팝업 상태.
 * - ME 탭 데이터 로드 후 maybeOpenRecap()로 "최근 종료·미열람" 1건을 자동 1회 노출.
 * - localStorage 'recapSeen:<challengeId>'로 1회만 자동 노출(완료 탭에서 수동 재오픈은 항상 가능).
 * (notifications/pushPromptStore 패턴 미러)
 */

const SEEN_PREFIX = 'recapSeen:';
const RECENT_DAYS = 14; // 이 기간 내 종료분만 자동 팝업 (과거 종료분 무더기 방지)

interface RecapState {
  isOpen: boolean;
  recap: any | null; // /c/challenges/my 아이템(중첩 challenge 포함)
  openRecap: (recap: any) => void;
  close: () => void;
}

export const useRecapStore = create<RecapState>((set) => ({
  isOpen: false,
  recap: null,
  openRecap: (recap) => set({ isOpen: true, recap }),
  close: () => set({ isOpen: false }),
}));

const seenKey = (id: string) => `${SEEN_PREFIX}${id}`;

export function hasSeenRecap(id: string): boolean {
  try {
    return Boolean(localStorage.getItem(seenKey(id)));
  } catch {
    return true; // 스토리지 불가 → 자동 노출 스킵(안전)
  }
}

export function markRecapSeen(id: string): void {
  try {
    localStorage.setItem(seenKey(id), '1');
  } catch {
    // 무시
  }
}

function isEnded(item: any): boolean {
  const st = String(item?.status || '').toLowerCase();
  const ph = String(item?.phase || '').toLowerCase();
  const lc = String(item?.challenge?.lifecycle || '').toLowerCase();
  return (
    ['completed', 'failed', 'gave_up'].includes(st) ||
    ['completed', 'failed', 'gave_up'].includes(ph) ||
    lc === 'completed' ||
    lc === 'archived'
  );
}

function endTime(item: any): number {
  const raw = item?.challenge?.challengeEndAt || item?.challenge?.endDate || null;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** ME 데이터 로드 후 호출 — 최근 종료·미열람 챌린지 1건을 자동 오픈 */
export function maybeOpenRecap(items: any[]): void {
  if (useRecapStore.getState().isOpen) return;
  const now = Date.now();
  const recentMs = RECENT_DAYS * 24 * 60 * 60 * 1000;

  const top = (items || [])
    .filter((it) => it?.challengeId && isEnded(it) && !hasSeenRecap(String(it.challengeId)))
    .filter((it) => {
      const et = endTime(it);
      return et > 0 && now - et <= recentMs; // 최근 종료분만 자동
    })
    .sort((a, b) => endTime(b) - endTime(a))[0];

  if (top) useRecapStore.getState().openRecap(top);
}
