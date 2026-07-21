import { randomBytes } from 'node:crypto';

/**
 * 쿠폰(입장권) 규칙 — 슈퍼어드민이 발급, 특정 멤버 지정 가능.
 * PG 계약 전 유료 챌린지를 열기 위한 운영 장치이며, PG 도입 후에도
 * 프로모션 수단으로 유지된다 (PAYMENT_SPEC §6.1 크리에이터 프로모션 0%와 연결).
 */
export type CouponStatus = 'active' | 'redeemed' | 'revoked' | 'expired';

export interface CouponLike {
  code: string;
  /** 특정 챌린지 한정 또는 'ANY' */
  challengeId: string;
  /** 지정 발급 시 해당 사용자만 사용 가능. 미지정이면 코드 소지자 누구나 */
  issuedToUserId?: string | null;
  status: CouponStatus;
  /** ISO — 없으면 무기한 */
  expiresAt?: string | null;
}

export type CouponRejection =
  | 'COUPON_NOT_ACTIVE'
  | 'COUPON_EXPIRED'
  | 'COUPON_NOT_YOURS'
  | 'COUPON_CHALLENGE_MISMATCH';

export function validateRedemption(
  coupon: CouponLike,
  userId: string,
  challengeId: string,
  now: Date,
): CouponRejection | null {
  if (coupon.status !== 'active') return 'COUPON_NOT_ACTIVE';
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) < now.getTime()) return 'COUPON_EXPIRED';
  if (coupon.issuedToUserId && coupon.issuedToUserId !== userId) return 'COUPON_NOT_YOURS';
  if (coupon.challengeId !== 'ANY' && coupon.challengeId !== challengeId) {
    return 'COUPON_CHALLENGE_MISMATCH';
  }
  return null;
}

/** 사람이 옮겨적기 쉬운 코드: CHME- + 8자 (혼동 문자 제외 32진) */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function generateCouponCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `CHME-${code}`;
}
