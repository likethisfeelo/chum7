export function getRemedyType(remedyPolicy: any): 'strict' | 'limited' | 'open' {
  const type = String(remedyPolicy?.type || 'open');
  if (type === 'strict' || type === 'limited') return type;
  return 'open';
}

export function getRemedyLabel(remedyPolicy: any): string {
  const type = getRemedyType(remedyPolicy);
  if (type === 'strict') return '보완 불가';
  if (type === 'limited') return `보완 제한 (${remedyPolicy?.maxRemedyDays ?? 0}회)`;
  return '보완 유연';
}

export function getRemainingRemedyCount(remedyPolicy: any, progress: any[]): number | null {
  const type = getRemedyType(remedyPolicy);
  const remediedCount = (progress || []).filter((p: any) => p?.remedied).length;

  if (type === 'open') return null;
  if (type === 'strict') return 0;

  const max = Number(remedyPolicy?.maxRemedyDays || 0);
  return Math.max(max - remediedCount, 0);
}

export function getChallengeTypeLabel(typeRaw: string): string {
  const type = String(typeRaw || 'leader_personal');
  if (type === 'leader_only') return '리더 퀘스트';
  if (type === 'personal_only') return '개인 퀘스트';
  if (type === 'mixed') return '혼합형';
  return '리더+개인';
}
