/**
 * 응원 데드레터(DLQ) 운영 순수 로직 — 레거시 admin/cheer/dead-letter/* 이식.
 * 신규 cheer 테이블 키: pk=`DLQ#<cheerId>`/sk=`META`, gsi2pk=`DLQ#<YYYY-MM-DD>`, gsi2sk=`<failedAt>`
 * (레거시 failedAt-index status 파티션 → 일자 파티션 Query 재작성, 풀스캔 금지)
 */

export const DEFAULT_LOOKBACK_DAYS = 7;
export const MAX_RANGE_DAYS = 62;
export const REQUEUE_DELAY_MS = 60 * 1000;
export const MAX_BATCH_SIZE = 50;

export function parseIsoOrNull(value?: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export interface IsoRange {
  fromIso: string;
  toIso: string;
}

/** fromIso/toIso 정규화 — 기본 조회 구간은 최근 7일 (레거시 stats/requeue-by-query 승계) */
export function resolveIsoRange(
  rawFrom: string | undefined | null,
  rawTo: string | undefined | null,
  now: Date,
): { range?: IsoRange; error?: string } {
  const parsedFrom = parseIsoOrNull(rawFrom);
  const parsedTo = parseIsoOrNull(rawTo);

  if ((rawFrom && !parsedFrom) || (rawTo && !parsedTo)) {
    return { error: 'fromIso/toIso는 ISO-8601 형식이어야 합니다' };
  }

  const toIso = parsedTo ?? now.toISOString();
  const fromIso = parsedFrom ?? new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  if (Date.parse(fromIso) > Date.parse(toIso)) {
    return { error: 'fromIso는 toIso보다 이후일 수 없습니다' };
  }
  return { range: { fromIso, toIso } };
}

/** 구간에 걸친 일자 파티션 목록 (최신일 우선, 최대 MAX_RANGE_DAYS) */
export function dayPartitions(range: IsoRange, maxDays = MAX_RANGE_DAYS): string[] {
  const days: string[] = [];
  const from = Date.UTC(
    Number(range.fromIso.slice(0, 4)),
    Number(range.fromIso.slice(5, 7)) - 1,
    Number(range.fromIso.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(range.toIso.slice(0, 4)),
    Number(range.toIso.slice(5, 7)) - 1,
    Number(range.toIso.slice(8, 10)),
  );
  for (let ms = to; ms >= from && days.length < maxDays; ms -= 24 * 60 * 60 * 1000) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

export interface RequeueFields {
  nowIso: string;
  scheduledTime: string;
}

/** 재처리 필드 — 재발송은 now + 60초 예약 (레거시 승계) */
export function computeRequeueFields(now: Date): RequeueFields {
  return {
    nowIso: now.toISOString(),
    scheduledTime: new Date(now.getTime() + REQUEUE_DELAY_MS).toISOString(),
  };
}

/** cheerIds 정규화 — 문자열화·trim·중복 제거 (레거시 requeue-batch 승계) */
export function normalizeCheerIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.map((value) => String(value ?? '').trim()).filter(Boolean);
  return Array.from(new Set(ids));
}
