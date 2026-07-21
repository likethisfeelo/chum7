/**
 * 관심 챌린지 토글 규칙 — 순수 로직 (AWS 무의존).
 * 레거시 핸들러 없음(백엔드 미구현 기능) — 최소 계약 `{ interested, count }` 신규 설계.
 */

export interface InterestToggleOutcome {
  /** 토글 후 상태 */
  interested: boolean;
  /** stats.interestCount 증감분 */
  delta: 1 | -1;
  message: string;
}

/** 이미 관심 등록돼 있으면 해제(-1), 아니면 등록(+1) */
export function toggleInterestOutcome(alreadyInterested: boolean): InterestToggleOutcome {
  if (alreadyInterested) {
    return { interested: false, delta: -1, message: '관심 챌린지에서 제거했어요' };
  }
  return { interested: true, delta: 1, message: '관심 챌린지로 등록됐어요! 새 소식을 알려드릴게요' };
}

/** 응답 count 계산 — 저장 카운트 + 증감분, 음수 방지 */
export function nextInterestCount(storedCount: unknown, delta: number): number {
  const base = typeof storedCount === 'number' && Number.isFinite(storedCount) ? storedCount : 0;
  return Math.max(0, base + delta);
}
