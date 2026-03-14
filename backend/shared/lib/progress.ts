export type ProgressRecord = {
  day: number;
  status: 'success' | 'failed' | null;
  verificationId?: string;
  timestamp?: string;
  delta?: number | null;
  score: number;
  remedied: boolean;
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
        item.status === 'success' || item.status === 'failed'
          ? (item.status as 'success' | 'failed')
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
    }))
    .filter((item) => item.day > 0)
    .sort((a, b) => a.day - b.day);

  const dedupedByDay = new Map<number, ProgressRecord>();
  for (const item of normalized) {
    dedupedByDay.set(item.day, item);
  }

  return [...dedupedByDay.values()].sort((a, b) => a.day - b.day);
}
