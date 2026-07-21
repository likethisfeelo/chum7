/** social 테이블 공통 유틸 — 키 상수·키 속성 제거 (이전 가이드 §3 social). */

export const TABLE = 'SOCIAL_TABLE';

export const KEY_ATTRS = ['pk', 'sk', 'gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk'] as const;

/** 응답 바디 계약 유지를 위해 내부 키 속성 제거 */
export function stripKeys<T extends Record<string, any>>(item: T): Record<string, any> {
  const copy: Record<string, any> = { ...item };
  for (const attr of KEY_ATTRS) delete copy[attr];
  return copy;
}

// ── 파티션 키 빌더 ──────────────────────────────────────────────────────
export const postPk = (plazaPostId: string) => `POST#${plazaPostId}`;
export const boardPk = (challengeId: string) => `BOARD#${challengeId}`;
export const bulletinPk = (challengeId: string, phase: string) => `BULL#${challengeId}#${phase}`;
export const verificationPk = (verificationId: string) => `VER#${verificationId}`;
export const tagPk = (tag: string) => `TAG#${tag}`;
export const recommendationPk = (userId: string) => `REC#${userId}`;
