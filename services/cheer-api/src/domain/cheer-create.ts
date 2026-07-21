/**
 * 응원 생성 순수 로직 — 레거시 verification/submit `createAutoCheer` 이식 (동작 변경 금지).
 * scheduledTime = 수신자 목표 시간(memberTarget24) - delta(분). 목표 시간이 이미 지났으면 immediate.
 * `day` 필드 포함 (docs/cheer-latest.md §2 — send-scheduled 수신자 완료 판정에 사용).
 */
import { META_SK, SENDER_SK, cheerPk, recvGsi1Pk, schedGsi2Pk, sentGsi1Pk } from '../repo/shared';

export const ANIMAL_ALIASES = ['새벽고래', '숲토끼', '별다람쥐', '파도해달', '노을팬더', '하늘사슴'] as const;

export function randomAlias(rand: () => number = Math.random): string {
  return ANIMAL_ALIASES[Math.floor(rand() * ANIMAL_ALIASES.length)] ?? ANIMAL_ALIASES[0];
}

/** 레거시 buildTargetDateTimeISO 이식 — Asia/Seoul은 고정 오프셋(-9h), 그 외는 UTC 해석 */
export function buildTargetDateTimeISO(
  verificationDate: string,
  time24: string,
  timezone: string,
): string | null {
  const timeParts = time24.split(':').map(Number);
  const dateParts = verificationDate.split('-').map(Number);
  const hh = timeParts[0] ?? Number.NaN;
  const mm = timeParts[1] ?? Number.NaN;
  const y = dateParts[0] ?? Number.NaN;
  const m = dateParts[1] ?? Number.NaN;
  const d = dateParts[2] ?? Number.NaN;

  if ([hh, mm, y, m, d].some((v) => Number.isNaN(v))) return null;

  if (timezone === 'Asia/Seoul') {
    const utcMs = Date.UTC(y, m - 1, d, hh - 9, mm, 0, 0);
    const iso = new Date(utcMs).toISOString();
    return Number.isNaN(new Date(iso).getTime()) ? null : iso;
  }

  const iso = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0)).toISOString();
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

export interface CheerSchedule {
  isImmediate: boolean;
  scheduledTime: string | null;
}

/**
 * 발송 스케줄 판정: scheduledMs = memberTargetMs - delta*60000, scheduledMs <= now → immediate.
 * 목표 시간이 없거나 파싱 불가면 immediate 폴백 (레거시는 응원 생성 자체를 생략 — API 표면에서는 즉시 발송).
 */
export function computeCheerSchedule(params: {
  memberTarget24: string | null;
  verificationDate: string;
  timezone: string;
  delta: number;
  nowIso: string;
}): CheerSchedule {
  const { memberTarget24, verificationDate, timezone, delta, nowIso } = params;
  if (!memberTarget24) return { isImmediate: true, scheduledTime: null };

  const memberTargetISO = buildTargetDateTimeISO(verificationDate, memberTarget24, timezone);
  if (!memberTargetISO) return { isImmediate: true, scheduledTime: null };

  const scheduledMs = new Date(memberTargetISO).getTime() - delta * 60000;
  const nowMs = new Date(nowIso).getTime();
  const isImmediate = scheduledMs <= nowMs;
  return {
    isImmediate,
    scheduledTime: isImmediate ? null : new Date(scheduledMs).toISOString(),
  };
}

export interface BuildCheerParams {
  cheerId: string;
  senderId: string;
  receiverId: string;
  challengeId: string;
  verificationId: string | null;
  day: number;
  message: string | null;
  delta: number;
  senderAlias: string;
  schedule: CheerSchedule;
  nowIso: string;
}

/**
 * cheer 테이블 아이템 2종 생성 (이전 가이드 §3 cheer):
 * - META: pk=CHEER#<id>/sk=META, gsi1=RECV#<receiverId>/<createdAt>, 예약분만 gsi2=SCHED#pending/<scheduledTime>
 * - SENDER 프로젝션(발신 조회 포인터): pk=CHEER#<id>/sk=SENDER, gsi1=SENT#<senderId>/<createdAt>
 */
export function buildCheerItems(params: BuildCheerParams): {
  meta: Record<string, any>;
  sentProjection: Record<string, any>;
} {
  const {
    cheerId, senderId, receiverId, challengeId, verificationId,
    day, message, delta, senderAlias, schedule, nowIso,
  } = params;
  const { isImmediate, scheduledTime } = schedule;

  const meta: Record<string, any> = {
    pk: cheerPk(cheerId),
    sk: META_SK,
    gsi1pk: recvGsi1Pk(receiverId),
    gsi1sk: nowIso,
    ...(isImmediate ? {} : { gsi2pk: schedGsi2Pk('pending'), gsi2sk: scheduledTime }),
    cheerId,
    senderId,
    receiverId,
    verificationId,
    challengeId,
    cheerType: isImmediate ? 'immediate' : 'scheduled',
    day,
    message,
    senderDelta: delta,
    senderAlias,
    scheduledTime,
    status: isImmediate ? 'sent' : 'pending',
    isRead: false,
    isThanked: false,
    thankedAt: null,
    isThankScoreGranted: false,
    thankScoreGrantedAt: null,
    thankMessage: null,
    thankMessageAt: null,
    replyMessage: null,
    repliedAt: null,
    reactionType: null,
    reactedAt: null,
    createdAt: nowIso,
    sentAt: isImmediate ? nowIso : null,
  };

  const sentProjection: Record<string, any> = {
    pk: cheerPk(cheerId),
    sk: SENDER_SK,
    gsi1pk: sentGsi1Pk(senderId),
    gsi1sk: nowIso,
    cheerId,
    senderId,
    createdAt: nowIso,
  };

  return { meta, sentProjection };
}
