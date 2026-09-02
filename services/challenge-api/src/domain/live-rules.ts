/**
 * 라이브 방(음성/방송) 순수 규칙 — AWS 무의존.
 * 방 속성 중 recording(저장 여부)은 개설 시 확정되며 이후 변경 불가.
 *  - 저장 방: 입장 전 '녹음 동의(record_consent)' 필요, 개설자만 원본 보관·다운로드
 *  - 오프더레코드 방: 입장 전 '경고 확인(offrecord_ack)' 필요, 채팅 포함 아무것도 저장하지 않음
 */

/** 좀비 방 방지 — 개설 후 이 시간이 지나면 status가 live여도 종료로 취급 */
export const LIVE_ROOM_MAX_AGE_HOURS = 12;

/** 예약 방 유예 — 예정 시각에서 이 시간이 지나도 시작되지 않으면 만료로 취급 */
export const LIVE_SCHEDULED_GRACE_HOURS = 24;

export type LiveRoomStatus = 'scheduled' | 'live' | 'ended';

/**
 * 예약 상태인지 — 예정 시각 + 유예를 넘긴 방은 시작되지 않은 것으로 보고 만료 처리한다
 * (개설자가 시작 버튼을 누르지 않으면 '예정' 배너가 영원히 남기 때문).
 */
export function isRoomScheduled(
  room: { status?: string; scheduledAt?: string | null } | null | undefined,
  now: Date,
): boolean {
  if (!room || room.status !== 'scheduled') return false;
  const at = Date.parse(String(room.scheduledAt ?? ''));
  if (!Number.isFinite(at)) return false;
  return now.getTime() <= at + LIVE_SCHEDULED_GRACE_HOURS * 60 * 60 * 1000;
}

/** 응답용 유효 상태 — 저장값이 아니라 시각 기준으로 판정 (배너·입장 차단의 단일 기준) */
export function effectiveRoomStatus(
  room: { status?: string; startedAt?: string | null; scheduledAt?: string | null } | null | undefined,
  now: Date,
): LiveRoomStatus {
  if (isRoomActive(room, now)) return 'live';
  if (isRoomScheduled(room, now)) return 'scheduled';
  return 'ended';
}

/** 방 전체 동시 인원 상한 (제품 요구: 10명 이내) */
export const LIVE_ROOM_MAX_PARTICIPANTS = 10;

/** 스피커 동시 상한 — P2P 메시 안정권 */
export const LIVE_ROOM_MAX_SPEAKERS = 6;

export type LiveConsentKind = 'record_consent' | 'offrecord_ack';

/** 방의 저장 여부에 따라 요구되는 동의 종류 */
export function consentKindFor(recording: boolean): LiveConsentKind {
  return recording ? 'record_consent' : 'offrecord_ack';
}

/**
 * 방이 "지금 진행 중"인지 — status만 믿지 않는다.
 * 개설자 브라우저가 종료 API를 못 부르고 사라지면 status='live'가 영원히 남으므로,
 * 개설 후 MAX_AGE를 넘긴 방은 종료로 취급한다 (배너/입장 차단의 단일 기준).
 */
export function isRoomActive(
  room: { status?: string; startedAt?: string | null } | null | undefined,
  now: Date,
): boolean {
  if (!room || room.status !== 'live') return false;
  const started = Date.parse(String(room.startedAt ?? ''));
  if (!Number.isFinite(started)) return false;
  return now.getTime() - started <= LIVE_ROOM_MAX_AGE_HOURS * 60 * 60 * 1000;
}

/**
 * 녹음 파일 키 검증 — presign 발급 경로(live/<challengeId>/<roomId>/...)를 벗어난
 * 키 등록을 거부한다 (recording-complete에서 임의 S3 키 주입 방지).
 */
export function isValidRecordingKey(challengeId: string, roomId: string, key: string): boolean {
  if (!key || key.includes('..')) return false;
  return key.startsWith(`live/${challengeId}/${roomId}/`);
}
