import {
  canProposeInLifecycle,
  canReviewProposal,
  decideSubmit,
  sortProposalsLatestFirst,
} from './proposal-rules';

describe('개인 퀘스트 제안 상태 규칙', () => {
  it('recruiting/preparing 에서만 제안 가능', () => {
    expect(canProposeInLifecycle('recruiting')).toBe(true);
    expect(canProposeInLifecycle('preparing')).toBe(true);
    expect(canProposeInLifecycle('active')).toBe(false);
    expect(canProposeInLifecycle('draft')).toBe(false);
    expect(canProposeInLifecycle(undefined)).toBe(false);
  });

  it('기존 제안 없음 → 신규 생성 (pending)', () => {
    expect(decideSubmit(undefined)).toEqual({ allowed: true, mode: 'create' });
  });

  it('pending 제안 존재 → 기존 아이템 갱신 (내용 교체)', () => {
    expect(decideSubmit('pending')).toEqual({ allowed: true, mode: 'update' });
  });

  it('rejected 제안 → 재제출 허용 (pending 복귀)', () => {
    expect(decideSubmit('rejected')).toEqual({ allowed: true, mode: 'update' });
  });

  it('approved 제안 → 재제출 불가', () => {
    const decision = decideSubmit('approved');
    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe('ALREADY_APPROVED');
  });

  it('심사는 pending 상태만 가능', () => {
    expect(canReviewProposal('pending')).toBe(true);
    expect(canReviewProposal('approved')).toBe(false);
    expect(canReviewProposal('rejected')).toBe(false);
    expect(canReviewProposal(undefined)).toBe(false);
  });

  it('latestProposal — updatedAt 최신순 정렬', () => {
    const sorted = sortProposalsLatestFirst([
      { updatedAt: '2026-01-01T00:00:00Z', id: 'a' },
      { updatedAt: '2026-03-01T00:00:00Z', id: 'b' },
      { updatedAt: '2026-02-01T00:00:00Z', id: 'c' },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });
});
