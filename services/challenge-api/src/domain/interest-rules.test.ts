import { nextInterestCount, toggleInterestOutcome } from './interest-rules';

describe('관심 챌린지 토글 규칙', () => {
  it('미등록 상태에서 토글하면 등록(+1)', () => {
    const outcome = toggleInterestOutcome(false);
    expect(outcome.interested).toBe(true);
    expect(outcome.delta).toBe(1);
  });

  it('등록 상태에서 토글하면 해제(-1)', () => {
    const outcome = toggleInterestOutcome(true);
    expect(outcome.interested).toBe(false);
    expect(outcome.delta).toBe(-1);
  });

  it('두 번 토글하면 원상 복귀 (delta 합 0)', () => {
    const first = toggleInterestOutcome(false);
    const second = toggleInterestOutcome(first.interested);
    expect(second.interested).toBe(false);
    expect(first.delta + second.delta).toBe(0);
  });

  it('count 는 음수로 내려가지 않는다', () => {
    expect(nextInterestCount(0, -1)).toBe(0);
    expect(nextInterestCount(undefined, -1)).toBe(0);
    expect(nextInterestCount(3, -1)).toBe(2);
    expect(nextInterestCount(3, 1)).toBe(4);
    expect(nextInterestCount('bad' as unknown, 1)).toBe(1);
  });
});
