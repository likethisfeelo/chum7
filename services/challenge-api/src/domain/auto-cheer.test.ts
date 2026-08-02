import { computeCheerSchedule, buildCheerItems } from './auto-cheer';

describe('computeCheerSchedule', () => {
  it('목표시각 - delta 가 현재 이후면 예약(scheduled)', () => {
    // 목표 08:00(KST), delta 30분 → 07:30 발송 예정. 현재 06:00 → 예약.
    const s = computeCheerSchedule({
      memberTarget24: '08:00',
      verificationDate: '2026-08-02',
      timezone: 'Asia/Seoul',
      delta: 30,
      nowIso: '2026-08-01T21:00:00.000Z', // 06:00 KST
    });
    expect(s.isImmediate).toBe(false);
    expect(s.scheduledTime).toBe('2026-08-01T22:30:00.000Z'); // 07:30 KST
  });

  it('발송 예정 시각이 이미 지났으면 즉시(immediate)', () => {
    const s = computeCheerSchedule({
      memberTarget24: '08:00',
      verificationDate: '2026-08-02',
      timezone: 'Asia/Seoul',
      delta: 30,
      nowIso: '2026-08-02T00:00:00.000Z', // 09:00 KST (이미 07:30 지남)
    });
    expect(s.isImmediate).toBe(true);
    expect(s.scheduledTime).toBeNull();
  });

  it('목표시각 없으면 즉시 폴백', () => {
    const s = computeCheerSchedule({
      memberTarget24: null,
      verificationDate: '2026-08-02',
      timezone: 'Asia/Seoul',
      delta: 10,
      nowIso: '2026-08-02T00:00:00.000Z',
    });
    expect(s.isImmediate).toBe(true);
  });
});

describe('buildCheerItems', () => {
  it('예약분은 gsi2 SCHED#pending 파티션 + status pending', () => {
    const { meta, sentProjection } = buildCheerItems({
      cheerId: 'c1',
      senderId: 'A',
      receiverId: 'B',
      challengeId: 'ch1',
      verificationId: 'v1',
      day: 2,
      delta: 30,
      senderAlias: '숲토끼',
      schedule: { isImmediate: false, scheduledTime: '2026-08-01T22:30:00.000Z' },
      nowIso: '2026-08-01T21:00:00.000Z',
    });
    expect(meta.pk).toBe('CHEER#c1');
    expect(meta.sk).toBe('META');
    expect(meta.status).toBe('pending');
    expect(meta.gsi2pk).toBe('SCHED#pending');
    expect(meta.gsi2sk).toBe('2026-08-01T22:30:00.000Z');
    expect(meta.gsi1pk).toBe('RECV#B');
    expect(sentProjection.gsi1pk).toBe('SENT#A');
  });

  it('즉시분은 status sent + gsi2 없음', () => {
    const { meta } = buildCheerItems({
      cheerId: 'c2',
      senderId: 'A',
      receiverId: 'B',
      challengeId: 'ch1',
      verificationId: 'v1',
      day: 2,
      delta: 30,
      senderAlias: '숲토끼',
      schedule: { isImmediate: true, scheduledTime: null },
      nowIso: '2026-08-02T00:00:00.000Z',
    });
    expect(meta.status).toBe('sent');
    expect(meta.gsi2pk).toBeUndefined();
    expect(meta.sentAt).toBe('2026-08-02T00:00:00.000Z');
  });
});
