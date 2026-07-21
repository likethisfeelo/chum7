import {
  canReviewProposal,
  canReviewSubmission,
  matchesStatusFilter,
  proposalReviewOutcome,
  reviewOutcome,
  summarizeSubmissions,
} from './review-rules';

describe('domain/review-rules', () => {
  it('canReviewSubmission — pending만 허용', () => {
    expect(canReviewSubmission('pending')).toBe(true);
    expect(canReviewSubmission('approved')).toBe(false);
    expect(canReviewSubmission('rejected')).toBe(false);
    expect(canReviewSubmission(undefined)).toBe(false);
  });

  it('reviewOutcome(approve) — 승인/보상/재제출 차단', () => {
    expect(reviewOutcome('approve')).toEqual({
      status: 'approved',
      rewardGranted: true,
      canResubmit: false,
      message: '제출물이 승인되었습니다',
    });
  });

  it('reviewOutcome(reject) — 거절/재제출 허용', () => {
    expect(reviewOutcome('reject')).toEqual({
      status: 'rejected',
      rewardGranted: false,
      canResubmit: true,
      message: '제출물이 거절되었습니다. 사용자가 재제출할 수 있습니다.',
    });
  });

  it('matchesStatusFilter — approved 필터는 auto_approved 포함', () => {
    expect(matchesStatusFilter('auto_approved', 'approved')).toBe(true);
    expect(matchesStatusFilter('approved', 'approved')).toBe(true);
    expect(matchesStatusFilter('pending', 'approved')).toBe(false);
    expect(matchesStatusFilter('rejected', 'all')).toBe(true);
    expect(matchesStatusFilter('pending', 'pending')).toBe(true);
  });

  it('canReviewProposal — pending만 허용 (개인 퀘스트 제안 상태 규칙)', () => {
    expect(canReviewProposal('pending')).toBe(true);
    expect(canReviewProposal('approved')).toBe(false);
    expect(canReviewProposal('rejected')).toBe(false);
    expect(canReviewProposal(undefined)).toBe(false);
  });

  it('proposalReviewOutcome — approve/reject 상태 전이 (v1: 상태 갱신만)', () => {
    expect(proposalReviewOutcome('approve')).toEqual({
      status: 'approved',
      message: '개인 퀘스트 제안이 승인되었습니다',
    });
    expect(proposalReviewOutcome('reject')).toEqual({
      status: 'rejected',
      message: '개인 퀘스트 제안이 반려되었습니다. 사용자가 재제출할 수 있습니다.',
    });
  });

  it('summarizeSubmissions — status/scope별 집계', () => {
    const summary = summarizeSubmissions([
      { status: 'pending', quest: { questScope: 'leader' } },
      { status: 'pending', quest: { questScope: 'personal' } },
      { status: 'approved', quest: null },
    ]);
    expect(summary.byStatus).toEqual({ pending: 2, approved: 1 });
    expect(summary.byScope).toEqual({ leader: 1, personal: 1, unknown: 1 });
  });
});
