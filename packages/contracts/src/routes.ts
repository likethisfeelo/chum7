/**
 * API 도메인 프리픽스 — API Gateway에는 프리픽스 프록시 라우트만 등록되고
 * 세부 경로는 각 서비스의 Hono 라우터가 처리한다 (REDESIGN_PLAN §3.2).
 */
export const API_PREFIXES = {
  user: '/u',
  challenge: '/c',
  social: '/s',
  cheer: '/ch',
  gamification: '/g',
  commerce: '/pay',
  admin: '/adm',
  /** 인증 불필요 공개 경로 (탐색·마당 열람 등) */
  public: '/public',
  /** PG 웹훅 등 외부 시스템 수신 (authorizer 없음 + 핸들러 서명 검증) */
  hooks: '/hooks',
} as const;

export type ApiPrefix = (typeof API_PREFIXES)[keyof typeof API_PREFIXES];
