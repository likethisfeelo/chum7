import {
  decideFriendRequest,
  interactionLevel,
  isEligible,
  pairOrder,
} from './friend-eligibility';

const T = 100;

describe('isEligible (양방향 임계값)', () => {
  it('양쪽 방향 모두 임계값 이상이어야 자격', () => {
    expect(isEligible({ outCount: 100, inCount: 100 }, T)).toBe(true);
    expect(isEligible({ outCount: 250, inCount: 130 }, T)).toBe(true);
  });

  it('한쪽만 충족하면 자격 없음(단방향 신청 방지)', () => {
    expect(isEligible({ outCount: 100, inCount: 99 }, T)).toBe(false);
    expect(isEligible({ outCount: 5, inCount: 500 }, T)).toBe(false);
  });

  it('집계 없음·부분 필드는 0으로 취급', () => {
    expect(isEligible(null, T)).toBe(false);
    expect(isEligible(undefined, T)).toBe(false);
    expect(isEligible({ outCount: 100 }, T)).toBe(false); // inCount 미존재 = 0
    expect(isEligible({}, T)).toBe(false);
  });

  it('임계값은 파라미터로 조정 가능(순차 출시 하향)', () => {
    expect(isEligible({ outCount: 10, inCount: 10 }, 10)).toBe(true);
    expect(isEligible({ outCount: 10, inCount: 10 }, 100)).toBe(false);
  });
});

describe('pairOrder (쌍 키 정규화)', () => {
  it('사전순 작은 쪽이 lo — 순서 무관하게 동일', () => {
    expect(pairOrder('bob', 'alice')).toEqual({ lo: 'alice', hi: 'bob' });
    expect(pairOrder('alice', 'bob')).toEqual({ lo: 'alice', hi: 'bob' });
  });
});

describe('interactionLevel (비식별 강도)', () => {
  it('양방향 총량 기준 버킷', () => {
    expect(interactionLevel({ outCount: 150, inCount: 150 })).toBe('frequent'); // 300
    expect(interactionLevel({ outCount: 100, inCount: 50 })).toBe('regular'); // 150
    expect(interactionLevel({ outCount: 100, inCount: 100 })).toBe('regular'); // 200
    expect(interactionLevel({ outCount: 100, inCount: 40 })).toBe('occasional'); // 140
  });
});

describe('decideFriendRequest (신청 시 동작 결정)', () => {
  const eligibleStat = { outCount: 100, inCount: 100 };

  it('이미 친구/차단은 자격과 무관하게 우선 단락', () => {
    expect(decideFriendRequest({ status: 'accepted' }, eligibleStat, T)).toBe('already_friends');
    expect(decideFriendRequest({ status: 'blocked' }, eligibleStat, T)).toBe('blocked');
    // 자격 미달이어도 accepted/blocked가 먼저
    expect(decideFriendRequest({ status: 'blocked' }, null, T)).toBe('blocked');
  });

  it('자격 미달이면 not_eligible', () => {
    expect(decideFriendRequest(null, { outCount: 100, inCount: 10 }, T)).toBe('not_eligible');
    expect(decideFriendRequest(undefined, null, T)).toBe('not_eligible');
  });

  it('상대가 이미 나에게 신청(incoming pending) + 자격 → 자동 친구', () => {
    expect(
      decideFriendRequest({ status: 'pending', direction: 'incoming' }, eligibleStat, T),
    ).toBe('auto_friend');
  });

  it('내가 이미 신청한 상태(outgoing pending)에서 재신청은 최초 신청 취급(자동 친구 아님)', () => {
    expect(
      decideFriendRequest({ status: 'pending', direction: 'outgoing' }, eligibleStat, T),
    ).toBe('first_request');
  });

  it('관계 없음 + 자격 → 최초 신청', () => {
    expect(decideFriendRequest(null, eligibleStat, T)).toBe('first_request');
    expect(decideFriendRequest(undefined, eligibleStat, T)).toBe('first_request');
  });
});
