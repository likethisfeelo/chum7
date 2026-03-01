import fs from 'fs';
import path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('sprint2 workflow source guards', () => {
  test('review-join-request uses conditional update for pending-only moderation', () => {
    const src = read('backend/services/challenge/review-join-request/index.ts');
    expect(src).toContain("ConditionExpression: '#status = :pendingCurrent'");
    expect(src).toContain('ALREADY_REVIEWED_OR_INVALID_STATE');
  });

  test('request-refund keeps staged refund request status', () => {
    const src = read('backend/services/challenge/request-refund/index.ts');
    expect(src).toContain("refundStatus = :requested");
    expect(src).toContain("paymentStatus = :refundRequested");
    expect(src).not.toContain("SET #status = :failed");
  });

  test('payout admin APIs are wired in challenge stack', () => {
    const stack = read('infra/stacks/challenge-stack.ts');
    expect(stack).toContain('/challenges/{challengeId}/payout/review');
    expect(stack).toContain('/challenges/{challengeId}/payout/finalize');
  });

  test('payout handlers enforce admin groups and completed lifecycle', () => {
    const review = read('backend/services/challenge/review-payout/index.ts');
    const finalize = read('backend/services/challenge/finalize-payout/index.ts');

    expect(review).toContain("groups.includes('admins')");
    expect(finalize).toContain("groups.includes('admins')");

    expect(review).toContain("lifecycle !== 'completed' &&");
    expect(review).toContain("lifecycle !== 'archived'");
    expect(finalize).toContain("challenge.lifecycle !== 'completed' && challenge.lifecycle !== 'archived'");
  });
});
