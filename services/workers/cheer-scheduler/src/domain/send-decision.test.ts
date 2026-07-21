import {
  buildDeadLetterItem,
  getBackoffMinutes,
  isReceiverDayCompleted,
  normalizeProgress,
  parseBackoffMinutes,
  planFailure,
  toFailureCode,
} from './send-decision';

describe('send-decision domain', () => {
  describe('toFailureCode (레거시 분류 승계)', () => {
    it('classifies throttling errors', () => {
      expect(toFailureCode(new Error('rate exceeded'))).toBe('THROTTLED');
      expect(toFailureCode(new Error('Throttling: too many requests'))).toBe('THROTTLED');
    });

    it('classifies timeout errors', () => {
      expect(toFailureCode(new Error('socket timeout'))).toBe('TIMEOUT');
      expect(toFailureCode(new Error('request timed out'))).toBe('TIMEOUT');
    });

    it('classifies permission errors', () => {
      expect(toFailureCode(new Error('access denied'))).toBe('PERMISSION_DENIED');
    });

    it('falls back to NOTIFICATION_SEND_FAILED', () => {
      expect(toFailureCode(new Error('boom'))).toBe('NOTIFICATION_SEND_FAILED');
    });
  });

  describe('backoff', () => {
    it('parses env list and picks per retry count with cap', () => {
      const backoffs = parseBackoffMinutes('1,5,15');
      expect(backoffs).toEqual([1, 5, 15]);
      expect(getBackoffMinutes(backoffs, 1)).toBe(1);
      expect(getBackoffMinutes(backoffs, 2)).toBe(5);
      expect(getBackoffMinutes(backoffs, 3)).toBe(15);
      expect(getBackoffMinutes(backoffs, 9)).toBe(15);
    });

    it('defaults to 1 minute when list is empty', () => {
      expect(getBackoffMinutes([], 1)).toBe(1);
      expect(parseBackoffMinutes('abc, -3')).toEqual([]);
    });
  });

  describe('planFailure', () => {
    const nowMs = Date.parse('2026-07-21T00:00:00.000Z');

    it('schedules retry with incremented retryCount and failure code when retries remain', () => {
      const plan = planFailure({
        cheer: { cheerId: 'c1', retryCount: 0, scheduledTime: '2026-07-20T23:00:00.000Z' },
        error: new Error('socket timeout'),
        maxRetries: 3,
        backoffMinutes: [1, 5, 15],
        nowMs,
      });
      expect(plan.outcome).toBe('retry');
      expect(plan.retryCount).toBe(1);
      expect(plan.failureCode).toBe('TIMEOUT');
      if (plan.outcome === 'retry') {
        expect(plan.nextRetryAt).toBe('2026-07-21T00:01:00.000Z');
        expect(plan.originalScheduledTime).toBe('2026-07-20T23:00:00.000Z');
      }
    });

    it('moves to dead when retry is exhausted', () => {
      const plan = planFailure({
        cheer: { cheerId: 'c1', retryCount: 3 },
        error: new Error('rate exceeded'),
        maxRetries: 3,
        backoffMinutes: [1, 5, 15],
        nowMs,
      });
      expect(plan.outcome).toBe('dead');
      expect(plan.retryCount).toBe(3);
      expect(plan.failureCode).toBe('THROTTLED');
    });
  });

  describe('isReceiverDayCompleted', () => {
    it('is true only for progress[day].status === success', () => {
      const participation = { progress: [{ day: 1, status: 'success' }, { day: 2, status: 'partial' }] };
      expect(isReceiverDayCompleted(participation, 1)).toBe(true);
      expect(isReceiverDayCompleted(participation, 2)).toBe(false);
      expect(isReceiverDayCompleted(participation, 3)).toBe(false);
      expect(isReceiverDayCompleted(undefined, 1)).toBe(false);
    });

    it('accepts object-map progress (레거시 normalizeProgress 승계)', () => {
      const participation = { progress: { d1: { day: 1, status: 'success' } } };
      expect(isReceiverDayCompleted(participation, 1)).toBe(true);
      expect(normalizeProgress(participation.progress)).toHaveLength(1);
    });
  });

  describe('buildDeadLetterItem', () => {
    it('keeps legacy fields and applies DLQ key design + 30d ttl', () => {
      const now = new Date('2026-07-21T01:02:03.000Z');
      const item = buildDeadLetterItem(
        {
          cheerId: 'c1',
          senderId: 's1',
          receiverId: 'u1',
          challengeId: 'ch1',
          message: 'm',
          retryCount: 3,
          scheduledTime: '2026-07-21T00:00:00.000Z',
        },
        'THROTTLED',
        'rate exceeded',
        now,
      );

      expect(item.pk).toBe('DLQ#c1');
      expect(item.sk).toBe('META');
      expect(item.gsi2pk).toBe('DLQ#2026-07-21');
      expect(item.gsi2sk).toBe('2026-07-21T01:02:03.000Z');
      expect(item.cheerId).toBe('c1');
      expect(item.status).toBe('dead');
      expect(item.retryCount).toBe(3);
      expect(item.failureCode).toBe('THROTTLED');
      expect(item.deadLetterReason).toBe('rate exceeded');
      expect(item.originalScheduledTime).toBe('2026-07-21T00:00:00.000Z');
      expect(item.lastScheduledTime).toBe('2026-07-21T00:00:00.000Z');
      expect(item.senderId).toBe('s1');
      expect(item.receiverId).toBe('u1');
      expect(item.challengeId).toBe('ch1');
      expect(item.message).toBe('m');
      expect(item.ttl).toBe(Math.floor(now.getTime() / 1000) + 60 * 60 * 24 * 30);
    });
  });
});
