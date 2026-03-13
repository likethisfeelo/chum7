export function isValidTrimRange(start?: number, end?: number): boolean {
  if (start === undefined || end === undefined) return true;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start < 0 || end < 0) return false;
  if (start >= end) return false;
  return end - start <= 60;
}
