/** 레거시 backend/shared/lib/progress.ts 이식 (동작 변경 금지). */

export type ProgressRecord = {
  day: number;
  status: 'success' | 'partial' | 'failed' | 'completed' | 'remedy' | null;
  verificationId?: string;
  timestamp?: string;
  delta?: number | null;
  score: number;
  remedied: boolean;
  leaderQuestDone?: boolean;
  leaderQuestIds?: string[];
  personalQuestDone?: boolean;
  leaderVerificationId?: string;
  personalVerificationId?: string;
};

function toSafeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeProgress(progress: unknown): ProgressRecord[] {
  const list = Array.isArray(progress)
    ? progress
    : progress && typeof progress === 'object'
      ? Object.values(progress as Record<string, unknown>)
      : [];

  const normalized = list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item): ProgressRecord => ({
      day: toSafeNumber(item.day),
      status:
        item.status === 'success' || item.status === 'partial' || item.status === 'failed' ||
        item.status === 'completed' || item.status === 'remedy'
          ? (item.status as ProgressRecord['status'])
          : null,
      verificationId:
        typeof item.verificationId === 'string' ? item.verificationId : undefined,
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
      delta:
        item.delta === null || item.delta === undefined
          ? null
          : toSafeNumber(item.delta, 0),
      score: toSafeNumber(item.score, 0),
      remedied: item.remedied === true,
      leaderQuestDone: item.leaderQuestDone === true ? true : undefined,
      leaderQuestIds: Array.isArray(item.leaderQuestIds) ? (item.leaderQuestIds as string[]) : undefined,
      personalQuestDone: item.personalQuestDone === true ? true : undefined,
      leaderVerificationId:
        typeof item.leaderVerificationId === 'string' ? item.leaderVerificationId : undefined,
      personalVerificationId:
        typeof item.personalVerificationId === 'string' ? item.personalVerificationId : undefined,
    }))
    .filter((item) => item.day > 0)
    .sort((a, b) => a.day - b.day);

  const dedupedByDay = new Map<number, ProgressRecord>();
  for (const item of normalized) {
    dedupedByDay.set(item.day, item);
  }

  return [...dedupedByDay.values()].sort((a, b) => a.day - b.day);
}

/**
 * 보완 대상이 될 수 있는 Day 번호 목록 (1..maxDay).
 * 진행표 '항목'이 아니라 Day 번호를 순회한다 — 인증을 한 번도 제출하지 않은 날은
 * 항목 자체가 만들어지지 않아, 항목만 훑으면 통째로 누락된다.
 * 성공(success) 또는 이미 보완한 날만 제외한다.
 */
export function missedDaysFromProgress(progress: ProgressRecord[], maxDay: number): number[] {
  const byDay = new Map<number, ProgressRecord>();
  for (const p of progress) byDay.set(p.day, p);

  const missed: number[] = [];
  for (let day = 1; day <= maxDay; day += 1) {
    const record = byDay.get(day);
    if (record && (record.status === 'success' || record.remedied)) continue;
    missed.push(day);
  }
  return missed;
}
