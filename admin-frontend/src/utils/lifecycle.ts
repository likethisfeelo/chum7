export type Lifecycle = 'draft' | 'recruiting' | 'preparing' | 'active' | 'completed' | 'archived';

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  draft:      '초안',
  recruiting: '모집중',
  preparing:  '준비중',
  active:     '진행중',
  completed:  '완료',
  archived:   '보관됨',
};

export const TRANSITION_LABEL: Partial<Record<Lifecycle, string>> = {
  recruiting: '모집 시작',
  preparing:  '모집 마감',
  active:     '챌린지 시작',
  completed:  '완료 처리',
  archived:   '보관',
};

export function lifecycleLabel(lc: string): string {
  return LIFECYCLE_LABEL[lc as Lifecycle] ?? lc;
}

export function transitionLabel(lc: string): string {
  return TRANSITION_LABEL[lc as Lifecycle] ?? lc;
}
