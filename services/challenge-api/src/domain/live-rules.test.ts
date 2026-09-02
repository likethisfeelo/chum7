import {
  LIVE_ROOM_MAX_AGE_HOURS,
  consentKindFor,
  isRoomActive,
  isValidRecordingKey,
} from './live-rules';

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
