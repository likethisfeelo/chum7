import {
  STAT_FIELDS,
  emptyStats,
  onCheerCreated,
  onReactionGiven,
  onReplyGiven,
  onThankSent,
  toStatsView,
} from './stats-rules';

describe('stats-rules (응원 통계 증분 규칙)', () => {
  describe('onCheerCreated', () => {
    it('예약 응원: 발신자 sentCount만 증가', () => {
      expect(onCheerCreated({ senderId: 'u1', receiverId: 'u2', isImmediate: false })).toEqual([
        { userId: 'u1', add: { sentCount: 1 } },
      ]);
    });

    it('즉시 응원: 발신자 sentCount + 수신자 receivedCount', () => {
      expect(onCheerCreated({ senderId: 'u1', receiverId: 'u2', isImmediate: true })).toEqual([
        { userId: 'u1', add: { sentCount: 1 } },
        { userId: 'u2', add: { receivedCount: 1 } },
      ]);
    });
  });

  describe('onReactionGiven', () => {
    it('리액션한 수신자 given + 응원 발신자 received', () => {
      expect(onReactionGiven({ senderId: 'u1', receiverId: 'u2' })).toEqual([
        { userId: 'u2', add: { reactionGivenCount: 1 } },
        { userId: 'u1', add: { reactionReceivedCount: 1 } },
      ]);
    });

    it('발신자 정보 없으면 수신자 쪽만 증가', () => {
      expect(onReactionGiven({ senderId: null, receiverId: 'u2' })).toEqual([
        { userId: 'u2', add: { reactionGivenCount: 1 } },
      ]);
    });

    it('발신자=수신자(방어)면 중복 증가 없음', () => {
      expect(onReactionGiven({ senderId: 'u2', receiverId: 'u2' })).toHaveLength(1);
    });
  });

  describe('onReplyGiven', () => {
    it('답장한 수신자 replyCount 증가', () => {
      expect(onReplyGiven({ receiverId: 'u2' })).toEqual([
        { userId: 'u2', add: { replyCount: 1 } },
      ]);
    });
  });

  describe('onThankSent', () => {
    it('성공 건수만큼 발신자 thankedCount 증가', () => {
      expect(onThankSent({ senderId: 'u1', updatedCount: 3 })).toEqual([
        { userId: 'u1', add: { thankedCount: 3 } },
      ]);
    });

    it('성공 0건이면 증분 없음', () => {
      expect(onThankSent({ senderId: 'u1', updatedCount: 0 })).toEqual([]);
    });

    it('음수/비정상 입력은 증분 없음', () => {
      expect(onThankSent({ senderId: 'u1', updatedCount: -2 })).toEqual([]);
      expect(onThankSent({ senderId: 'u1', updatedCount: Number.NaN })).toEqual([]);
    });
  });

  describe('emptyStats / toStatsView', () => {
    it('모든 카운터가 0으로 초기화된다', () => {
      const stats = emptyStats();
      for (const field of STAT_FIELDS) expect(stats[field]).toBe(0);
    });

    it('아이템 부재 시 0 뷰 반환', () => {
      expect(toStatsView(undefined)).toEqual(emptyStats());
    });

    it('아이템 값 정규화 (음수·소수·비수치 → 0 이상 정수)', () => {
      const view = toStatsView({
        sentCount: 5,
        receivedCount: -3,
        replyCount: 2.9,
        thankedCount: 'x',
        reactionGivenCount: undefined,
      });
      expect(view.sentCount).toBe(5);
      expect(view.receivedCount).toBe(0);
      expect(view.replyCount).toBe(2);
      expect(view.thankedCount).toBe(0);
      expect(view.reactionGivenCount).toBe(0);
      expect(view.thankScoreEarned).toBe(0);
      expect(view.receiverCompletedCount).toBe(0);
    });
  });
});
