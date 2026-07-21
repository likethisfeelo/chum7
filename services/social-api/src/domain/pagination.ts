/**
 * 페이지네이션 토큰 순수 로직.
 * - nextToken: base64(JSON of LastEvaluatedKey) — 이전 가이드 §6 패턴.
 * - 마당 피드 cursor: 레거시 plaza/feed의 perType 커서 포맷 승계
 *   (`{ perType: { [postType]: LastEvaluatedKey } }` base64. 구형 `{ lastEvaluatedKey }` 포맷은 무시하고 재시작).
 */

export function toNextToken(lastKey?: Record<string, any>): string | null {
  if (!lastKey) return null;
  return Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64');
}

/** 잘못된 토큰은 throw('INVALID_NEXT_TOKEN') — 라우트에서 400 매핑 */
export function parseNextToken(token?: string | null): Record<string, any> | undefined {
  if (!token) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    if (!decoded || typeof decoded !== 'object') throw new Error('INVALID_NEXT_TOKEN');
    return decoded as Record<string, any>;
  } catch {
    throw new Error('INVALID_NEXT_TOKEN');
  }
}

// ── 마당 피드 perType 커서 (레거시 plaza/feed 포맷 그대로) ──────────────

export type CursorMap = Partial<Record<string, Record<string, any>>>;

export interface FeedCursor {
  perType?: CursorMap;
  legacyCursorDetected?: boolean;
}

/** 손상/구형 커서는 조용히 무시 (레거시 동작: 빈 커서로 재시작) */
export function decodeFeedCursor(raw?: string | null): FeedCursor {
  if (!raw) return {};
  try {
    const json = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return {};

    const cursor = parsed as any;
    if (cursor.perType && typeof cursor.perType === 'object') {
      return { perType: cursor.perType };
    }
    if (cursor.lastEvaluatedKey && typeof cursor.lastEvaluatedKey === 'object') {
      return { legacyCursorDetected: true };
    }
    return {};
  } catch {
    return {};
  }
}

export function encodeFeedCursor(cursor: FeedCursor | null): string | null {
  if (!cursor?.perType || Object.keys(cursor.perType).length === 0) return null;
  return Buffer.from(JSON.stringify({ perType: cursor.perType })).toString('base64');
}
