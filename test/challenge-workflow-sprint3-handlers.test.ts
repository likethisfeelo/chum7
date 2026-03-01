import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('sprint3 source guards', () => {
  test('refund review api exists and enforces requested-only condition', () => {
    const src = read('backend/services/challenge/review-refund/index.ts');
    expect(src).toContain("decision as 'approve' | 'reject'");
    expect(src).toContain("ConditionExpression: 'refundStatus = :requested'");
    expect(src).toContain('REFUND_REVIEW_CONFLICT');
  });

  test('payout review validates reasonCode enum and writes audit log', () => {
    const src = read('backend/services/challenge/review-payout/index.ts');
    expect(src).toContain('reasonCode');
    expect(src).toContain("['LEADER_INACTIVE', 'POLICY_VIOLATION', 'COMPLAINT_CONFIRMED', 'OTHER']");
    expect(src).toContain('PAYOUT_AUDIT_LOGS_TABLE');
    expect(src).toContain("action: 'review'");
  });

  test('finalize payout validates amount and eligibility before finalize', () => {
    const src = read('backend/services/challenge/finalize-payout/index.ts');
    expect(src).toContain('INVALID_PAYOUT_AMOUNT');
    expect(src).toContain('leaderPayoutStatus = :eligible');
    expect(src).toContain('PAYOUT_NOT_ELIGIBLE_OR_ALREADY_FINALIZED');
    expect(src).toContain("action: 'finalize'");
  });

  test('challenge stack wires refund review endpoint and payout audit env', () => {
    const stack = read('infra/stacks/challenge-stack.ts');
    expect(stack).toContain('PAYOUT_AUDIT_LOGS_TABLE');
    expect(stack).toContain('/challenges/{challengeId}/refund/{userChallengeId}/review');
  });
});
