/**
 * 응원 대상 추천 순수 로직 — 레거시 verification/submit의 incompleteMembers 선별 이식.
 * (active 참여자 중 본인 제외 + 해당 day 미완료 필터)
 */

export interface ProgressEntryLite {
  day: number;
  status: string | null;
}

/** 레거시 normalizeProgress 이식 (배열/객체 맵 모두 허용) */
export function normalizeProgressLite(progress: unknown): ProgressEntryLite[] {
  const list = Array.isArray(progress)
    ? progress
    : progress && typeof progress === 'object'
      ? Object.values(progress as Record<string, unknown>)
      : [];
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      day: Number(item.day),
      status: typeof item.status === 'string' ? item.status : null,
    }));
}

/** 해당 day 인증 완료 여부 — progress[day].status === 'success' (docs/cheer-latest.md §3-1) */
export function isDaySuccess(progress: unknown, day: number): boolean {
  const entry = normalizeProgressLite(progress).find((p) => p.day === day);
  return entry?.status === 'success';
}

export interface CheerTargetView {
  userId: string;
  personalTarget: Record<string, any> | null;
  score: number;
  consecutiveDays: number;
}

/** active 참여자 중 본인 제외 + day 미완료 멤버 = 응원 대상 */
export function selectCheerTargets(
  participations: Array<Record<string, any>>,
  options: { selfId: string; day: number },
): CheerTargetView[] {
  const { selfId, day } = options;
  return participations
    .filter((member) => {
      if (!member || typeof member.userId !== 'string') return false;
      if (member.userId === selfId || member.status !== 'active') return false;
      return !isDaySuccess(member.progress, day);
    })
    .map((member) => ({
      userId: member.userId as string,
      personalTarget: member.personalTarget ?? null,
      score: Number.isFinite(Number(member.score)) ? Number(member.score) : 0,
      consecutiveDays: Number.isFinite(Number(member.consecutiveDays)) ? Number(member.consecutiveDays) : 0,
    }));
}
