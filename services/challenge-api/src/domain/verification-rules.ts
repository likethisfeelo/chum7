/**
 * 인증(verification) 판정 순수 로직.
 * - resolveVerificationType/isValidTrimRange: 레거시 backend/shared/lib/{verification-type,trim-validation}.ts 이식
 * - day 완료/isExtra/partial 판정: 레거시 backend/services/verification/submit/index.ts에서 추출
 *   (혼합형 leader_personal 퀘스트 플로우 포함 — 동작 변경 금지)
 */
import type { ProgressRecord } from './progress';

export type VerificationType = 'text' | 'image' | 'video' | 'link';

const ALLOWED_TYPES = new Set<VerificationType>(['text', 'image', 'video', 'link']);

export function resolveVerificationType(input: {
  verificationType?: VerificationType | string | null;
  linkUrl?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
}): VerificationType {
  const explicit = typeof input.verificationType === 'string' ? input.verificationType.trim() : '';
  if (explicit && ALLOWED_TYPES.has(explicit as VerificationType)) {
    return explicit as VerificationType;
  }

  const linkUrl = typeof input.linkUrl === 'string' ? input.linkUrl.trim() : '';
  const videoUrl = typeof input.videoUrl === 'string' ? input.videoUrl.trim() : '';
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';

  if (linkUrl) return 'link';
  if (videoUrl) return 'video';
  if (imageUrl && /\.(mp4|webm|mov)(\?|$)/i.test(imageUrl)) return 'video';
  if (imageUrl) return 'image';
  return 'text';
}

/** @deprecated Use resolveVerificationType instead */
export const inferVerificationType = resolveVerificationType;

export function isValidTrimRange(start?: number, end?: number): boolean {
  if (start === undefined || end === undefined) return true;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start < 0 || end < 0) return false;
  if (start >= end) return false;
  return end - start <= 60;
}

/** 챌린지 allowedVerificationTypes 정규화 (레거시 sanitize 로직 이식) */
export function resolveAllowedTypes(rawAllowedTypes: unknown): VerificationType[] {
  const allowedTypes: VerificationType[] = ['image', 'text', 'link', 'video'];
  if (Array.isArray(rawAllowedTypes) && rawAllowedTypes.length > 0) {
    const sanitized = rawAllowedTypes.filter((type): type is VerificationType =>
      ['image', 'text', 'link', 'video'].includes(type as string),
    );
    if (sanitized.length > 0) return sanitized;
  }
  return allowedTypes;
}

export type QuestType = 'leader' | 'personal';

/** 요청 questType 우선, 없으면 challengeType 기본값 추론 (mixed는 null 유지) */
export function resolveQuestType(
  challengeType: string,
  requested?: QuestType | null,
): QuestType | null {
  if (requested) return requested;
  if (challengeType === 'leader_only') return 'leader';
  if (challengeType === 'personal_only') return 'personal';
  return null;
}

export interface DayCompletionContext {
  challengeType: string;
  /** 등록된 리더 퀘스트 ID 목록 (조회 성공 시) */
  totalLeaderQuestIds: string[];
  /** true → 퀘스트 조회 성공(0개 포함) / false → 조회 실패·미설정 → 레거시 boolean 폴백 */
  leaderQuestsFetched: boolean;
}

export interface DayCompletionRules {
  isMixedType: boolean;
  isLeaderOnlyType: boolean;
  isPersonalOnlyType: boolean;
  totalLeaderQuestCount: number;
  isLeaderAllDone(dp: ProgressRecord | null | undefined): boolean;
  isDayComplete(dp: ProgressRecord | null | undefined): boolean;
  isQuestAlreadyDone(
    dp: ProgressRecord | null | undefined,
    qt: QuestType | null,
    questId?: string | null,
  ): boolean;
}

/** challengeType 기반 하루 완료 판정 룰 팩토리 (레거시 submit 핸들러 내부 함수 추출) */
export function createDayCompletionRules(ctx: DayCompletionContext): DayCompletionRules {
  const { challengeType, totalLeaderQuestIds, leaderQuestsFetched } = ctx;
  const totalLeaderQuestCount = totalLeaderQuestIds.length;
  const isMixedType = challengeType === 'leader_personal' || challengeType === 'mixed';
  const isLeaderOnlyType = challengeType === 'leader_only';
  const isPersonalOnlyType = challengeType === 'personal_only';

  function isLeaderAllDone(dp: ProgressRecord | null | undefined): boolean {
    if (!dp) return false;
    if (totalLeaderQuestCount === 0) {
      if (leaderQuestsFetched) return false;
      return dp.leaderQuestDone === true;
    }
    return (dp.leaderQuestIds?.length ?? 0) >= totalLeaderQuestCount;
  }

  function isDayComplete(dp: ProgressRecord | null | undefined): boolean {
    if (!dp) return false;
    if (isMixedType) return isLeaderAllDone(dp) && dp.personalQuestDone === true;
    if (isLeaderOnlyType) return isLeaderAllDone(dp);
    if (isPersonalOnlyType) return dp.personalQuestDone === true;
    return dp.status === 'success';
  }

  function isQuestAlreadyDone(
    dp: ProgressRecord | null | undefined,
    qt: QuestType | null,
    questId?: string | null,
  ): boolean {
    if (!dp) return false;
    if (qt === 'leader') {
      if (totalLeaderQuestCount === 0) {
        if (leaderQuestsFetched) return false;
        return dp.leaderQuestDone === true;
      }
      const submittedIds: string[] = dp.leaderQuestIds ?? [];
      return questId ? submittedIds.includes(questId) : submittedIds.length >= totalLeaderQuestCount;
    }
    if (qt === 'personal') return dp.personalQuestDone === true;
    return dp.status === 'success';
  }

  return {
    isMixedType,
    isLeaderOnlyType,
    isPersonalOnlyType,
    totalLeaderQuestCount,
    isLeaderAllDone,
    isDayComplete,
    isQuestAlreadyDone,
  };
}

export interface SubmissionOutcome {
  isExtra: boolean;
  /** 이 인증으로 하루가 완료되는가 (score·응원 집계 기준) */
  dayNowComplete: boolean;
  leaderQuestIds: string[];
  leaderQuestDone: boolean | undefined;
  personalQuestDone: boolean | undefined;
}

/**
 * 이번 제출로 인한 day 상태 변화를 미리 계산 (레거시 submit의 isExtra/_leaderDone/_personalDone 블록 추출).
 */
export function evaluateSubmission(
  rules: DayCompletionRules,
  ctx: DayCompletionContext,
  dayProgress: ProgressRecord | null | undefined,
  resolvedQuestType: QuestType | null,
  questId?: string | null,
): SubmissionOutcome {
  const isExtra =
    rules.isDayComplete(dayProgress) ||
    (resolvedQuestType !== null && rules.isQuestAlreadyDone(dayProgress, resolvedQuestType, questId));

  const existingLeaderQuestIds: string[] = dayProgress?.leaderQuestIds ?? [];
  const leaderQuestIds: string[] =
    resolvedQuestType === 'leader' && questId && !existingLeaderQuestIds.includes(questId)
      ? [...existingLeaderQuestIds, questId]
      : existingLeaderQuestIds;

  const leaderQuestDone: boolean | undefined =
    resolvedQuestType === 'leader'
      ? (rules.totalLeaderQuestCount === 0
          ? (ctx.leaderQuestsFetched ? false : true)
          : leaderQuestIds.length >= rules.totalLeaderQuestCount)
      : (dayProgress?.leaderQuestDone ?? (rules.isLeaderOnlyType ? false : undefined));

  const personalQuestDone: boolean | undefined =
    resolvedQuestType === 'personal'
      ? true
      : (dayProgress?.personalQuestDone ?? (rules.isPersonalOnlyType ? false : undefined));

  // personal_only: 개인 퀘스트 1개 제출로 완료 (레거시 `: true` fallthrough 버그 수정 승계)
  const dayNowComplete: boolean = rules.isMixedType
    ? leaderQuestDone === true && personalQuestDone === true
    : rules.isLeaderOnlyType
      ? leaderQuestDone === true
      : rules.isPersonalOnlyType
        ? personalQuestDone === true
        : true;

  return { isExtra, dayNowComplete, leaderQuestIds, leaderQuestDone, personalQuestDone };
}

// ── 시간 계산 헬퍼 (레거시 submit 핸들러 추출) ─────────────────────────────

function parseIsoToMs(value: string): number | null {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function calculateDelta(targetTime: string, completedAt: string): number | null {
  const target = parseIsoToMs(targetTime);
  const completed = parseIsoToMs(completedAt);
  if (target === null || completed === null) return null;

  const diffMs = target - completed;
  return Math.floor(diffMs / 60000);
}

export function buildTargetDateTimeISO(
  verificationDate: string,
  time24: string,
  timezone: string,
): string | null {
  const [hh, mm] = time24.split(':').map(Number);
  const [y, m, d] = verificationDate.split('-').map(Number);

  const hasInvalidParts = [hh, mm, y, m, d].some((v) => v === undefined || Number.isNaN(v));
  if (hasInvalidParts) return null;

  if (timezone === 'Asia/Seoul') {
    const utcMs = Date.UTC(y!, m! - 1, d!, hh! - 9, mm!, 0, 0);
    const iso = new Date(utcMs).toISOString();
    return Number.isNaN(new Date(iso).getTime()) ? null : iso;
  }

  const iso = new Date(Date.UTC(y!, m! - 1, d!, hh!, mm!, 0, 0)).toISOString();
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** 클라이언트 시계가 서버보다 최대 60초 앞선 경우 서버 시각으로 대체 (오탐 방지 — 레거시 승계) */
export const CLOCK_SKEW_TOLERANCE_MS = 60_000;

export function resolvePerformedAt(performedAtRaw: string, nowIso: string): string {
  const performedAtMs = new Date(performedAtRaw).getTime();
  const nowMs = new Date(nowIso).getTime();
  return performedAtMs > nowMs && performedAtMs - nowMs <= CLOCK_SKEW_TOLERANCE_MS
    ? nowIso
    : performedAtRaw;
}
