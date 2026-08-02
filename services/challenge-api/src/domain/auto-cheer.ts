/**
 * 조기완료 자동응원(auto-cheer) 레코드 생성 순수 로직.
 * 레거시 verification/submit `createAutoCheer` 이식 — 인증 제출 시 미완료 팀원에게 응원 레코드를 만든다.
 *
 * ⚠️ cheer 테이블 아이템 형태·키는 cheer-api의 정식 정의와 동일해야 한다 (동작 변경 금지):
 *   canonical: services/cheer-api/src/domain/cheer-create.ts + services/cheer-api/src/repo/shared.ts
 *   발송(예약/즉시 전이)·감사점수 처리는 기존 cheer-scheduler 워커가 담당하므로 형태만 맞추면 된다.
 */

// ── cheer 테이블 키 빌더 (cheer-api/repo/shared.ts와 동일) ──
const cheerPk = (cheerId: string) => `CHEER#${cheerId}`;
const META_SK = 'META';
const SENDER_SK = 'SENDER';
const recvGsi1Pk = (receiverId: string) => `RECV#${receiverId}`;
const sentGsi1Pk = (senderId: string) => `SENT#${senderId}`;
const schedGsi2Pk = (status: string) => `SCHED#${status}`;

export const ANIMAL_ALIASES = ['새벽고래', '숲토끼', '별다람쥐', '파도해달', '노을팬더', '하늘사슴'] as const;

export function randomAlias(rand: () => number = Math.random): string {
  return ANIMAL_ALIASES[Math.floor(rand() * ANIMAL_ALIASES.length)] ?? ANIMAL_ALIASES[0];
}

/** 레거시 buildTargetDateTimeISO — Asia/Seoul은 고정 오프셋(-9h), 그 외는 UTC 해석 */
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
    const iso = new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0, 0)).toISOString();
    return Number.isNaN(new Date(iso).getTime()) ? null : iso;
  }
  const iso = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0)).toISOString();
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

export interface CheerSchedule {
  isImmediate: boolean;
  scheduledTime: string | null;
}

/** scheduledMs = memberTargetMs - delta*60000; <= now → 즉시 발송 */
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
  const isImmediate = scheduledMs <= new Date(nowIso).getTime();
  return { isImmediate, scheduledTime: isImmediate ? null : new Date(scheduledMs).toISOString() };
}

export interface BuildCheerParams {
  cheerId: string;
  senderId: string;
  receiverId: string;
  challengeId: string;
  verificationId: string | null;
  day: number;
  delta: number;
  senderAlias: string;
  schedule: CheerSchedule;
  nowIso: string;
}

/** cheer 테이블 아이템 2종 (META + SENDER 프로젝션) — cheer-api buildCheerItems와 동형 */
export function buildCheerItems(params: BuildCheerParams): {
  meta: Record<string, any>;
  sentProjection: Record<string, any>;
} {
  const { cheerId, senderId, receiverId, challengeId, verificationId, day, delta, senderAlias, schedule, nowIso } = params;
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
    message: null,
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
