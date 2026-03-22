export function getRemedyType(remedyPolicy: any): 'disabled' | 'last_day' | 'anytime' {
  const type = String(remedyPolicy?.type || 'anytime');
  if (type === 'disabled' || type === 'last_day') return type;
  return 'anytime';
}

export function getRemedyLabel(remedyPolicy: any): string {
  const type = getRemedyType(remedyPolicy);
  if (type === 'disabled') return '보완 불가';
  if (type === 'last_day') {
    const max = remedyPolicy?.maxRemedyDays;
    return max != null ? `마지막날 보완 (최대 ${max}회)` : '마지막날 보완 (전체 실패일)';
  }
  return '보완 자유';
}

export function getRemainingRemedyCount(remedyPolicy: any, progress: any[]): number | null {
  const type = getRemedyType(remedyPolicy);
  const remediedCount = (progress || []).filter((p: any) => p?.remedied).length;

  if (type === 'anytime') return null;
  if (type === 'disabled') return 0;

  const max = remedyPolicy?.maxRemedyDays;
  if (max == null) return null;
  return Math.max(Number(max) - remediedCount, 0);
}

export function getChallengeTypeLabel(typeRaw: string): string {
  const type = String(typeRaw || 'leader_personal');
  if (type === 'leader_only') return '리더 퀘스트';
  if (type === 'personal_only') return '개인 퀘스트';
  if (type === 'mixed') return '혼합형';
  return '리더+개인';
}
