/**
 * nextToken 페이지네이션 유틸 — base64url(JSON of LastEvaluatedKey).
 * (레거시 personal-feed 핸들러들의 토큰 형식 그대로. 이전 가이드 §6.)
 */
export function decodeNextToken(
  token: string | null | undefined,
): Record<string, unknown> | undefined {
  if (!token) return undefined;
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
}

export function encodeNextToken(
  lastEvaluatedKey: Record<string, unknown> | undefined,
): string | null {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64url');
}

/** limit 쿼리 파라미터 정규화 (레거시: 기본 20, 최대 50) */
export function normalizeLimit(raw: string | undefined, fallback = 20, max = 50): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/** 응답에서 내부 키 속성 제거 (pk/sk/gsi*) */
export function stripKeyAttrs<T extends Record<string, unknown>>(
  item: T,
): Record<string, unknown> {
  const { pk: _pk, sk: _sk, gsi1pk: _g1p, gsi1sk: _g1s, gsi2pk: _g2p, gsi2sk: _g2s, ...rest } =
    item as Record<string, unknown>;
  return rest;
}
