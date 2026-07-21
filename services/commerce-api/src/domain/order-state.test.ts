import { canTransitionOrder, isDepositExpired, isJoinEligible } from './order-state';
import { generateCouponCode, validateRedemption } from './coupon-rules';

describe('order state machine (커머스 v0)', () => {
  it('허용된 전이만 통과', () => {
    expect(canTransitionOrder('awaiting_deposit', 'paid')).toBe(true);
    expect(canTransitionOrder('awaiting_deposit', 'rejected')).toBe(true);
    expect(canTransitionOrder('awaiting_deposit', 'canceled')).toBe(true);
    expect(canTransitionOrder('paid', 'canceled')).toBe(false);
    expect(canTransitionOrder('rejected', 'paid')).toBe(false);
  });

  it('참여 자격은 paid + 본인 + 해당 챌린지', () => {
    const order = { status: 'paid', userId: 'u1', challengeId: 'c1' };
    expect(isJoinEligible(order, 'u1', 'c1')).toBe(true);
    expect(isJoinEligible(order, 'u2', 'c1')).toBe(false);
    expect(isJoinEligible(order, 'u1', 'c2')).toBe(false);
    expect(isJoinEligible({ ...order, status: 'awaiting_deposit' }, 'u1', 'c1')).toBe(false);
  });

  it('수동 입금 72시간 만료', () => {
    const now = new Date('2026-07-25T00:00:00Z');
    expect(isDepositExpired('2026-07-24T00:00:00Z', now)).toBe(false);
    expect(isDepositExpired('2026-07-21T00:00:00Z', now)).toBe(true);
  });
});

describe('coupon rules', () => {
  const base = { code: 'CHME-TEST1234', challengeId: 'c1', status: 'active' as const };
  const now = new Date('2026-07-25T00:00:00Z');

  it('정상 사용', () => {
    expect(validateRedemption(base, 'u1', 'c1', now)).toBeNull();
    expect(validateRedemption({ ...base, challengeId: 'ANY' }, 'u1', 'c9', now)).toBeNull();
  });

  it('지정 발급 쿠폰은 해당 멤버만', () => {
    const coupon = { ...base, issuedToUserId: 'u1' };
    expect(validateRedemption(coupon, 'u1', 'c1', now)).toBeNull();
    expect(validateRedemption(coupon, 'u2', 'c1', now)).toBe('COUPON_NOT_YOURS');
  });

  it('상태·만료·챌린지 불일치 거절', () => {
    expect(validateRedemption({ ...base, status: 'redeemed' }, 'u1', 'c1', now)).toBe('COUPON_NOT_ACTIVE');
    expect(validateRedemption({ ...base, expiresAt: '2026-07-01T00:00:00Z' }, 'u1', 'c1', now)).toBe('COUPON_EXPIRED');
    expect(validateRedemption(base, 'u1', 'c2', now)).toBe('COUPON_CHALLENGE_MISMATCH');
  });

  it('코드 형식', () => {
    const code = generateCouponCode();
    expect(code).toMatch(/^CHME-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/);
    expect(generateCouponCode()).not.toBe(generateCouponCode());
  });
});
