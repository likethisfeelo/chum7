/** 관심영역(리더+카테고리) 표시 유틸 — 자동 구독 이름 생성. */

const CATEGORY_LABEL: Record<string, string> = {
  selflove: '건강',
  discipline: '습관',
  create: '자기계발',
  explore: '창작',
  build: '관계',
  attitude: '마음챙김',
  expand: '확장',
  impact: '임팩트',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] || category || '기타';
}

/** 자동 생성 구독 이름 — 사용자는 이름 지정 없이 좋아요만으로 등록되므로 카테고리+챌린지로 명명. */
export function autoSubscriptionName(category: string, challengeTitle?: string): string {
  const label = categoryLabel(category);
  const title = (challengeTitle || '').trim();
  return title ? `${label} · ${title}` : `${label} 관심영역`;
}
