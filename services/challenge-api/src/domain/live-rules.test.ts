import {
  LIVE_ROOM_MAX_AGE_HOURS,
  LIVE_SCHEDULED_GRACE_HOURS,
  consentKindFor,
  effectiveRoomStatus,
  isRoomActive,
  isRoomScheduled,
  isValidRecordingKey,
} from './live-rules';

describe('isRoomScheduled / effectiveRoomStatus — 예약 방 판정', () => {
  const now = new Date('2026-09-03T10:00:00.000Z');

  it('예정 시각이 미래면 scheduled', () => {
    const room = { status: 'scheduled', scheduledAt: '2026-09-03T11:00:00.000Z', startedAt: null };
    expect(isRoomScheduled(room, now)).toBe(true);
    expect(effectiveRoomStatus(room, now)).toBe('scheduled');
  });

  it('예정 시각이 지났어도 유예 안이면 아직 scheduled (개설자가 늦게 시작할 수 있음)', () => {
    const room = { status: 'scheduled', scheduledAt: '2026-09-03T08:00:00.000Z', startedAt: null };
    expect(effectiveRoomStatus(room, now)).toBe('scheduled');
  });

  it('예정 시각 + 유예를 넘기면 만료(ended) — 시작 안 한 예약이 배너에 영원히 남지 않게', () => {
    const stale = new Date(now.getTime() - (LIVE_SCHEDULED_GRACE_HOURS + 1) * 60 * 60 * 1000).toISOString();
    const room = { status: 'scheduled', scheduledAt: stale, startedAt: null };
    expect(isRoomScheduled(room, now)).toBe(false);
    expect(effectiveRoomStatus(room, now)).toBe('ended');
  });

  it('시작된 방은 scheduledAt이 있어도 live', () => {
    const room = { status: 'live', scheduledAt: '2026-09-03T09:00:00.000Z', startedAt: '2026-09-03T09:05:00.000Z' };
    expect(effectiveRoomStatus(room, now)).toBe('live');
  });

  it('scheduledAt이 깨졌거나 status가 다르면 scheduled 아님', () => {
    expect(isRoomScheduled({ status: 'scheduled', scheduledAt: 'bad' }, now)).toBe(false);
    expect(isRoomScheduled({ status: 'live', scheduledAt: '2026-09-03T11:00:00.000Z' }, now)).toBe(false);
    expect(effectiveRoomStatus(null, now)).toBe('ended');
  });
});

describe('consentKindFor — 저장 여부에 따른 동의 유형', () => {
  it('저장 방은 녹음 동의, 오프더레코드 방은 경고 확인', () => {
    expect(consentKindFor(true)).toBe('record_consent');
    expect(consentKindFor(false)).toBe('offrecord_ack');
  });
});

describe('isRoomActive — 좀비 방 종료 취급', () => {
  const now = new Date('2026-08-14T12:00:00.000Z');

  it('status=live + 최근 개설이면 진행 중', () => {
    expect(isRoomActive({ status: 'live', startedAt: '2026-08-14T11:00:00.000Z' }, now)).toBe(true);
  });

  it('ended 또는 방 없음은 진행 아님', () => {
    expect(isRoomActive({ status: 'ended', startedAt: '2026-08-14T11:00:00.000Z' }, now)).toBe(false);
    expect(isRoomActive(null, now)).toBe(false);
  });

  it('개설 후 MAX_AGE를 넘긴 live 방은 종료 취급 (개설자 이탈로 종료 API 미호출)', () => {
    const stale = new Date(now.getTime() - (LIVE_ROOM_MAX_AGE_HOURS + 1) * 60 * 60 * 1000).toISOString();
    expect(isRoomActive({ status: 'live', startedAt: stale }, now)).toBe(false);
  });

  it('startedAt이 깨져 있으면 진행 아님', () => {
    expect(isRoomActive({ status: 'live', startedAt: 'bad-date' }, now)).toBe(false);
    expect(isRoomActive({ status: 'live' }, now)).toBe(false);
  });
});

describe('isValidRecordingKey — presign 경로 밖 키 주입 방지', () => {
  it('발급 경로 프리픽스만 허용', () => {
    expect(isValidRecordingKey('c1', 'r1', 'live/c1/r1/part-1-abc.webm')).toBe(true);
    expect(isValidRecordingKey('c1', 'r1', 'live/c1/r2/part-1-abc.webm')).toBe(false);
    expect(isValidRecordingKey('c1', 'r1', 'uploads/u1/evil.webm')).toBe(false);
    expect(isValidRecordingKey('c1', 'r1', 'live/c1/r1/../../secret')).toBe(false);
    expect(isValidRecordingKey('c1', 'r1', '')).toBe(false);
  });
});
