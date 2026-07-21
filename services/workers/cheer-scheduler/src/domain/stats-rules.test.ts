import { onReceiverCompleted, onScheduledCheerSent } from './stats-rules';

describe('cheer-scheduler stats-rules (스케줄러 통계 증분 규칙)', () => {
  describe('onScheduledCheerSent', () => {
    it('발송 성공 시 수신자 receivedCount +1', () => {
      expect(onScheduledCheerSent('receiver-1')).toEqual([
        { userId: 'receiver-1', add: { receivedCount: 1 } },
      ]);
    });

    it('수신자 id 없으면 증분 없음 (방어)', () => {
      expect(onScheduledCheerSent('')).toEqual([]);
    });
  });

  describe('onReceiverCompleted', () => {
    it('수신자 선완료 시 발신자 thankScoreEarned·receiverCompletedCount +1', () => {
      expect(onReceiverCompleted('sender-1')).toEqual([
        { userId: 'sender-1', add: { thankScoreEarned: 1, receiverCompletedCount: 1 } },
      ]);
    });

    it('발신자 id 없으면 증분 없음 (방어)', () => {
      expect(onReceiverCompleted('')).toEqual([]);
    });
  });
});
