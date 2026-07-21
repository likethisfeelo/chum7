/** admin-api 공통 repo 유틸 — 키 속성 제거·nextToken (이전 가이드 §6 패턴, challenge-api repo/shared.ts 동형). */

export const KEY_ATTRS = ['pk', 'sk', 'gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk'] as const;

/** 응답 바디 계약 유지를 위해 내부 키 속성 제거 */
export function stripKeys<T extends Record<string, any>>(item: T): Record<string, any> {
  const copy: Record<string, any> = { ...item };
  for (const attr of KEY_ATTRS) delete copy[attr];
  return copy;
}

/** nextToken 패턴 — base64(JSON of LastEvaluatedKey) */
export function toNextToken(lastKey?: Record<string, any>): string | null {
  if (!lastKey) return null;
  return Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64');
}

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
