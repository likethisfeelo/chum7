/**
 * 어드민 챌린지 생성/시작 순수 로직 — 레거시 admin/challenge/{create,confirm-start} 이식.
 * (challenge-api src/domain/join-requirements.ts / day-sync.ts 와 동일 규칙 — 서비스 간
 * import 금지 규칙에 따라 소형 함수를 복사 유지)
 */

export const MIN_PREPARING_GAP_MS = 60 * 1000;

export interface LayerPolicyInput {
  requirePersonalGoalOnJoin: boolean;
  requirePersonalTargetOnJoin: boolean;
  allowExtraVisibilityToggle: boolean;
}

/** 챌린지 유형별 layerPolicy 정규화 (레거시 resolveLayerPolicy 승계) */
export function resolveLayerPolicy(challengeType: string, layerPolicy: LayerPolicyInput): LayerPolicyInput {
  const isMixed =
    challengeType === 'personal_only' || challengeType === 'leader_personal' || challengeType === 'mixed';
  return {
    requirePersonalGoalOnJoin: isMixed ? true : layerPolicy.requirePersonalGoalOnJoin,
    requirePersonalTargetOnJoin: layerPolicy.requirePersonalTargetOnJoin,
    allowExtraVisibilityToggle: layerPolicy.allowExtraVisibilityToggle,
  };
}

/** 챌린지 유형별 개인 퀘스트 활성 여부 (레거시 resolvePersonalQuestEnabled 승계) */
export function resolvePersonalQuestEnabled(challengeType: string): boolean {
  return challengeType === 'personal_only' || challengeType === 'leader_personal' || challengeType === 'mixed';
}

export interface TimelineValidationError {
  error: string;
  message: string;
}

/** 타임라인 순서 검증 (레거시 create 승계 — 모집마감 > 모집시작, 시작 ≥ 마감 + 1분) */
export function validateTimeline(input: {
  recruitingStartAt: string;
  recruitingEndAt: string;
  challengeStartAt: string;
}): TimelineValidationError | null {
  const recruitingStart = new Date(input.recruitingStartAt);
  const recruitingEnd = new Date(input.recruitingEndAt);
  const challengeStart = new Date(input.challengeStartAt);

  if (recruitingEnd <= recruitingStart) {
    return { error: 'INVALID_TIMELINE', message: '모집 마감일은 모집 시작일 이후여야 합니다' };
  }
  if (challengeStart.getTime() < recruitingEnd.getTime() + MIN_PREPARING_GAP_MS) {
    return {
      error: 'INVALID_TIMELINE',
      message: '챌린지 시작일은 모집 마감 시각으로부터 최소 1분 이후여야 합니다',
    };
  }
  return null;
}

/** last_day 보완 정책의 maxRemedyDays 상한 검증 (레거시 create 승계) */
export function validateRemedyPolicy(
  policy: { type: string; maxRemedyDays: number | null },
  durationDays: number,
): TimelineValidationError | null {
  if (policy.type === 'last_day' && policy.maxRemedyDays !== null && policy.maxRemedyDays > durationDays - 1) {
    return {
      error: 'INVALID_MAX_REMEDY_DAYS',
      message: `최대 보완 횟수는 챌린지 기간 - 1(${durationDays - 1})을 초과할 수 없습니다`,
    };
  }
  return null;
}

/** challengeEndAt = 시작 + durationDays (레거시 shared/challenge-day-sync 승계) */
export function calculateChallengeEndAt(startAtIso: string, durationDays: number): string {
  const startDate = new Date(startAtIso);
  if (Number.isNaN(startDate.getTime())) return startAtIso;
  const normalized = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : 7;
  startDate.setDate(startDate.getDate() + normalized);
  return startDate.toISOString();
}

/** durationDays 정규화 (레거시 resolveDurationDays 단순형 — 챌린지 값만 사용) */
export function resolveDurationDays(challengeDurationDays: unknown, fallback = 7): number {
  const candidate = Number(challengeDurationDays);
  if (Number.isFinite(candidate) && candidate > 0) return Math.floor(candidate);
  return fallback;
}

/** 생성 시점 초기 lifecycle — 모집 시작 시각이 지났으면 recruiting (레거시 승계) */
export function initialLifecycle(nowIso: string, recruitingStartAt: string): 'draft' | 'recruiting' {
  return nowIso >= recruitingStartAt ? 'recruiting' : 'draft';
}

/** confirm-start 가능 여부 판정 (레거시 confirm-start 가드 승계) */
export function validateConfirmStart(challenge: {
  lifecycle?: unknown;
  requireStartConfirmation?: unknown;
}): { status: number; error: string; message: string } | null {
  if (challenge.lifecycle !== 'preparing') {
    return {
      status: 409,
      error: 'INVALID_LIFECYCLE',
      message: `preparing 상태의 챌린지만 시작 확인할 수 있습니다. 현재 상태: ${String(challenge.lifecycle)}`,
    };
  }
  if (!challenge.requireStartConfirmation) {
    return {
      status: 409,
      error: 'CONFIRMATION_NOT_REQUIRED',
      message: '이 챌린지는 시작 전 확인이 필요하지 않습니다. 자동으로 시작됩니다.',
    };
  }
  return null;
}
