import {
  interactionsFromEvent,
  pairKey,
  scorePair,
  scoreSortKey,
  RECOMMEND_THRESHOLD,
} from './pairing';

describe('pairing — 이벤트 → 사용자쌍 상호작용', () => {
  it('comment.created → actor/target 쌍 1건 (본인 댓글 제외)', () => {
    const out = interactionsFromEvent('comment.created', {
      authorId: 'u1',
      targetOwnerId: 'u2',
      targetType: 'plaza',
      targetId: 'p1',
      commentId: 'c1',
      occurredAt: '2026-07-23T00:00:00.000Z',
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      actorUserId: 'u1',
      targetUserId: 'u2',
      interactionType: 'comment',
      interactionId: 'c1',
    });
  });

  it('본인=대상이면 상호작용 없음', () => {
    expect(
      interactionsFromEvent('comment.created', { authorId: 'u1', targetOwnerId: 'u1', commentId: 'c1' }),
    ).toHaveLength(0);
  });

  it('reaction.created → reaction 상호작용 + 멱등 id에 occurredAt 포함', () => {
    const out = interactionsFromEvent('reaction.created', {
      actorUserId: 'u1',
      targetOwnerId: 'u2',
      targetType: 'board',
      targetId: 'b1',
      occurredAt: '2026-07-23T00:00:00.000Z',
    });
    expect(out[0]!.interactionType).toBe('reaction');
    expect(out[0]!.interactionId).toContain('2026-07-23T00:00:00.000Z');
  });

  it('challenge.completed → 완주자 조합 쌍 (N choose 2), 멱등 id는 챌린지·쌍당 고정', () => {
    const out = interactionsFromEvent('challenge.completed', {
      challengeId: 'ch1',
      completedUserIds: ['a', 'b', 'c'],
      occurredAt: '2026-07-23T00:00:00.000Z',
    });
    expect(out).toHaveLength(3); // ab, ac, bc
    expect(out.every((x) => x.interactionType === 'co_challenge')).toBe(true);
    expect(out[0]!.interactionId).toBe('cc:ch1:a:b');
  });

  it('알 수 없는 이벤트 → 빈 배열', () => {
    expect(interactionsFromEvent('order.paid', { orderId: 'o1' })).toHaveLength(0);
  });

  it('challenge.completed 팬아웃 상한 — 완주자 초과 시 쌍 수 제한', () => {
    const many = Array.from({ length: 60 }, (_, i) => `u${i}`);
    const out = interactionsFromEvent('challenge.completed', {
      challengeId: 'big',
      completedUserIds: many,
      occurredAt: '2026-07-23T00:00:00.000Z',
    });
    // 25명 상한 → 300쌍 (60*59/2=1770이 아님)
    expect(out.length).toBe((25 * 24) / 2);
  });
});

describe('pairing — 점수/키', () => {
  it('pairKey는 사전순 정규화', () => {
    expect(pairKey('b', 'a')).toEqual({ lo: 'a', hi: 'b' });
    expect(pairKey('a', 'b')).toEqual({ lo: 'a', hi: 'b' });
  });

  it('scorePair 가중합 + 최근성 가산', () => {
    const now = Date.parse('2026-07-23T00:00:00.000Z');
    const score = scorePair(
      { sharedChallengeCount: 1, commentCount: 2, reactionCount: 1, lastInteractionAt: '2026-07-22T00:00:00.000Z' },
      now,
    );
    // 3*1 + 2*2 + 1*1 + recency(1일→+2) = 3+4+1+2 = 10
    expect(score).toBe(10);
  });

  it('scoreSortKey는 제로패딩(내림차순 정렬 가능)', () => {
    expect(scoreSortKey(10, 'u2')).toBe('000010#u2');
    expect(scoreSortKey(5, 'u1') < scoreSortKey(10, 'u2')).toBe(true);
  });

  it('임계값 상수 노출', () => {
    expect(RECOMMEND_THRESHOLD).toBeGreaterThan(0);
  });
});
