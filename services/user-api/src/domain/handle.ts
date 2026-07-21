/**
 * 피드 핸들(@username) 규칙 — 레거시 backend/services/personal-feed/handle 순수 로직.
 * 핸들 규칙: 소문자 영숫자 + _ , 3~20자, 숫자/_ 로 시작 불가. 변경은 30일에 1회.
 */
export const HANDLE_REGEX = /^[a-z][a-z0-9_]{2,19}$/;
export const HANDLE_CHANGE_COOLDOWN_DAYS = 30;

export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_REGEX.test(handle);
}

/**
 * 30일 변경 제한 판정. 변경 가능하면 null, 불가하면 다음 변경 가능 시각을 반환.
 * (레거시: daysSince < 30 → lastUpdated + 30일)
 */
export function nextHandleChangeAt(
  lastUpdatedAt: string | undefined,
  now: Date,
): Date | null {
  if (!lastUpdatedAt) return null;
  const last = new Date(lastUpdatedAt).getTime();
  const daysSince = (now.getTime() - last) / (1000 * 60 * 60 * 24);
  if (daysSince < HANDLE_CHANGE_COOLDOWN_DAYS) {
    return new Date(last + HANDLE_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  }
  return null;
}
