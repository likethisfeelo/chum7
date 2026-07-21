import { createHash } from 'node:crypto';

/**
 * Web Push 구독 endpoint → users 테이블 sk `PUSH#<endpointId>` 용 식별자.
 * sha256(endpoint) hex 앞 16자 — endpoint 원문은 아이템 속성으로 보존한다.
 */
export function pushEndpointId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
}
