/**
 * lifecycle-manager 순수 판정 로직 (AWS 무의존).
 * - 어떤 챌린지를 어느 상태로 전이할지: `@chum7/core`의 resolveDueLifecycle + canTransition 사용
 *   (레거시 backend/services/challenge/lifecycle-manager의 TRANSITION_RULES 대체).
 * - 완료 전환 시 참여자 완주/실패 판정: progress + isCompletedProgressStatus (레거시 finalizeUserChallenges).
 * - 리더 뱃지 판정 입력(LeaderChallengeSummary) 구성: 레거시 leader-badge-grant.getLeaderChallenges 집계 대응.
 */
import {
  resolveEffectiveLifecycle,
  transitionSteps,
  type ChallengeLifecycle,
} from '@chum7/core';
import {
  certDateFromIso,
  DEFAULT_TIMEZONE,
  isCompletedProgressStatus,
  resolveChallengeActualStartAt,
  resolveDurationDays,
} from './day-sync';
import { normalizeProgress } from './progress';
import type { LeaderChallengeSummary } from './leader-badge-grant';

/** draft 포함 — 예약 모집 오픈(recruitOpenAt)이 자동으로 발화하도록 (증상① 수정) */
export const MANAGED_LIFECYCLES = ['draft', 'recruiting', 'preparing', 'active'] as const;

/** 스케줄 필드 별칭 해석 — 레거시 데이터의 recruitStartAt/recruitingEndAt 승계 */
export function resolveRecruitOpenAt(ch: ChallengeLike): string | null {
  return (ch.recruitOpenAt as string) || (ch.recruitStartAt as string) || null;
}
export function resolveRecruitCloseAt(ch: ChallengeLike): string | null {
  return (
    (ch.recruitCloseAt as string) || (ch.recruitEndAt as string) || (ch.recruitingEndAt as string) || null
  );
}

export interface ChallengeLike {
  challengeId: string;
  lifecycle: string;
  category?: string;
  durationDays?: unknown;
  challengeStartAt?: string;
  actualStartAt?: string;
  startConfirmedAt?: string;
  requireStartConfirmation?: boolean;
  createdBy?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export type TransitionDecision =
  | { action: 'none' }
  /** 시작 확인 필요 챌린지가 미확인 상태 — preparing/recruiting에 잔류 (레거시 requireStartConfirmation 게이트) */
  | { action: 'hold'; reason: 'awaiting_start_confirmation' }
  /** steps 순서대로 전이 (예: preparing 기간 전체 경과 시 ['active','completed'] 2단계) */
  | { action: 'transition'; steps: ChallengeLifecycle[] };

/**
 * 시간 경과 기준 전이 판정 — core의 resolveEffectiveLifecycle(스케줄 인지·forward-only)로
 * 목표 상태를 계산하고 transitionSteps로 다단계 경로를 분해한다.
 * API 읽기 계층과 동일한 규칙 (docs/time-policy.md).
 */
export function decideTransition(challenge: ChallengeLike, now: Date): TransitionDecision {
  const from = challenge.lifecycle as ChallengeLifecycle;
  const startAtIso = resolveChallengeActualStartAt(challenge);
  const nowIso = now.toISOString();

  const startConfirmed = Boolean(challenge.startConfirmedAt);
  const target = resolveEffectiveLifecycle({
    lifecycle: from,
    recruitOpenAt: resolveRecruitOpenAt(challenge),
    recruitCloseAt: resolveRecruitCloseAt(challenge),
    startDate: startAtIso ? certDateFromIso(startAtIso, DEFAULT_TIMEZONE) : undefined,
    durationDays: resolveDurationDays(challenge.durationDays, undefined),
    nowIso,
    today: certDateFromIso(nowIso, DEFAULT_TIMEZONE),
    requireStartConfirmation: challenge.requireStartConfirmation === true,
    startConfirmed,
  });

  if (target === from) {
    // 게이트로 보류된 경우를 구분해 리포트 (시작 시각은 지났으나 확인 대기)
    if (
      challenge.requireStartConfirmation === true &&
      !startConfirmed &&
      from !== 'active' &&
      startAtIso &&
      certDateFromIso(startAtIso, DEFAULT_TIMEZONE) <= certDateFromIso(nowIso, DEFAULT_TIMEZONE) &&
      (from === 'preparing' || from === 'recruiting')
    ) {
      return { action: 'hold', reason: 'awaiting_start_confirmation' };
    }
    return { action: 'none' };
  }

  const steps = transitionSteps(from, target);
  return steps.length > 0 ? { action: 'transition', steps } : { action: 'none' };
}

// ── active 진입 시 참여자 처리 (레거시 activateUserChallenges + handleUnapprovedJoinRequests) ──

export interface ParticipationLike {
  userId?: string;
  userChallengeId?: string;
  phase?: string;
  status?: string;
  joinStatus?: string;
  progress?: unknown;
  [key: string]: unknown;
}

export type ActivationDecision = 'activate' | 'reject' | 'skip';

/** preparing 참여자: 승인(또는 joinStatus 없음) → 활성화, requested → 자동 거절, 그 외 변경 없음 */
export function decideActivation(uc: ParticipationLike): ActivationDecision {
  if (uc.phase !== 'preparing') return 'skip';
  if (uc.joinStatus === 'requested') return 'reject';
  if (uc.joinStatus === 'approved' || uc.joinStatus === undefined || uc.joinStatus === null) {
    return 'activate';
  }
  return 'skip';
}

// ── completed 진입 시 참여자 완주 판정 (레거시 finalizeUserChallenges) ──────────

export interface ParticipantFinalDecision {
  userId: string;
  finalStatus: 'completed' | 'failed';
  completedDays: number;
}

/**
 * phase=active 참여자만 판정. completedDays는 progress의 completed/success/remedy 일수
 * (challengeType별 하루 완료 룰은 인증 제출 시 progress.status에 이미 반영돼 있다 —
 * verification-rules의 판정 결과 승계).
 */
export function decideParticipantFinal(
  uc: ParticipationLike,
  durationDays: number,
): ParticipantFinalDecision | null {
  if (uc.phase !== 'active' || !uc.userId) return null;
  const completedDays = normalizeProgress(uc.progress).filter((p) =>
    isCompletedProgressStatus(p.status),
  ).length;
  return {
    userId: uc.userId,
    finalStatus: completedDays >= durationDays ? 'completed' : 'failed',
    completedDays,
  };
}

/** 완료 전환 1건의 참여자 전체 판정 + completedUserIds (challenge.completed 이벤트 detail) */
export function finalizeParticipants(
  participants: ParticipationLike[],
  durationDays: number,
): { finals: ParticipantFinalDecision[]; completedUserIds: string[] } {
  const finals = participants
    .map((uc) => decideParticipantFinal(uc, durationDays))
    .filter((d): d is ParticipantFinalDecision => d !== null);
  return {
    finals,
    completedUserIds: finals.filter((d) => d.finalStatus === 'completed').map((d) => d.userId),
  };
}

// ── 리더 뱃지 판정 입력 구성 (레거시 leader-badge-grant.getLeaderChallenges 집계) ──

/**
 * 리더의 완료 챌린지 1건 요약. 레거시 동일: 참여자는 phase가 completed/failed인 레코드만 집계,
 * 완주자는 status='completed'.
 */
export function buildLeaderChallengeSummary(
  challenge: ChallengeLike,
  participants: ParticipationLike[],
): LeaderChallengeSummary {
  const finalized = participants.filter(
    (uc) => uc.phase === 'completed' || uc.phase === 'failed',
  );
  const participantCount = finalized.length;
  const completedParticipants = finalized.filter((uc) => uc.status === 'completed').length;
  return {
    challengeId: challenge.challengeId,
    lifecycle: challenge.lifecycle,
    durationDays: resolveDurationDays(challenge.durationDays, undefined),
    createdAt: String(challenge.createdAt ?? ''),
    participantCount,
    completedParticipants,
    completionRate: participantCount > 0 ? completedParticipants / participantCount : 0,
  };
}
