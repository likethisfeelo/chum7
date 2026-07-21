/**
 * API 응답 envelope — 기존 시스템과 동일한 계약을 유지한다.
 * 성공: { success: true, message?, data? }
 * 실패: { error: CODE, message, details?, data? }
 */
export interface SuccessEnvelope<T> {
  success: true;
  message?: string;
  data?: T;
}

export interface ErrorEnvelope {
  error: string;
  message: string;
  details?: unknown;
  data?: unknown;
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;
