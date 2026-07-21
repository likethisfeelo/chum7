/**
 * @chum7/web-kit — 프론트엔드 2종(frontend, admin-frontend)의 공통 런타임.
 *
 * Phase 4(프론트 정리)에서 다음이 이곳으로 승격된다 (REDESIGN_PLAN §5.4):
 *  - api-client (axios 인스턴스 + 토큰 갱신 인터셉터 — 현 frontend/src/lib/api-client.ts 기반)
 *  - mediaUrl 유틸 (현 frontend/src/shared/utils/mediaUrl.ts)
 *  - challengeLifecycle 표시 유틸 (@chum7/core 라이프사이클 룰의 표시 레이어)
 */
export const WEB_KIT_PLACEHOLDER = true;
