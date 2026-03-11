export const DEFAULT_TIMEZONE = 'Asia/Seoul';

export type PracticeTimeValidationResult =
  | { ok: true; certDate: string }
  | { ok: false; errorCode: 'FUTURE_PRACTICE_TIME' | 'PRACTICE_TOO_OLD' };

export function safeTimezone(timezone?: string): string {
  if (!timezone) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function certDateFromIso(iso: string, timezone?: string): string {
  const tz = safeTimezone(timezone);
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

export function validatePracticeAt(practiceAt: string, uploadAtIso: string, timezone?: string): PracticeTimeValidationResult {
  const practiceMs = new Date(practiceAt).getTime();
  const uploadMs = new Date(uploadAtIso).getTime();

  if (Number.isNaN(practiceMs)) {
    return { ok: false, errorCode: 'PRACTICE_TOO_OLD' };
  }

  if (practiceMs > uploadMs) {
    return { ok: false, errorCode: 'FUTURE_PRACTICE_TIME' };
  }

  if (practiceMs < uploadMs - 16 * 60 * 60 * 1000) {
    return { ok: false, errorCode: 'PRACTICE_TOO_OLD' };
  }

  return { ok: true, certDate: certDateFromIso(practiceAt, timezone) };
}

export function calculateChallengeDay(startDateIso: string, certDate: string, timezone?: string): number {
  const tz = safeTimezone(timezone);
  const startCertDate = certDateFromIso(startDateIso, tz);

  const startUtc = new Date(`${startCertDate}T00:00:00.000Z`).getTime();
  const certUtc = new Date(`${certDate}T00:00:00.000Z`).getTime();

  return Math.floor((certUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1;
}

export function isInvalidDayDelta(requestDay: number, calculatedDay: number): boolean {
  return Math.abs(requestDay - calculatedDay) > 1;
}

export function remedyScore(basePoints: number): number {
  return Math.floor(basePoints * 0.7);
}
