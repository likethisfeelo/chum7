/**
 * 참여(join) 위자드 요구사항 판정.
 * - resolveJoinRequirements: 레거시 shared/join-requirements.ts 이식 (동작 변경 금지)
 * - resolveLayerPolicy / resolvePersonalQuestEnabled: 레거시 backend/services/challenge/create/index.ts 이식
 *   (docs/core-specs/01-challenge-types.md — personalQuestEnabled는 challengeType에서 백엔드가 강제)
 */

export interface LayerPolicyInput {
  requirePersonalGoalOnJoin?: boolean;
  requirePersonalTargetOnJoin?: boolean;
}

export interface JoinRequirementResult {
  requirePersonalGoalOnJoin: boolean;
  requirePersonalTargetOnJoin: boolean;
}

export function resolveJoinRequirements(
  challengeTypeRaw?: string,
  layerPolicyRaw?: LayerPolicyInput | null,
): JoinRequirementResult {
  const challengeType = String(challengeTypeRaw || 'leader_personal');
  const layerPolicy = layerPolicyRaw || {};
  const defaultRequireGoal =
    challengeType === 'personal_only' || challengeType === 'leader_personal' || challengeType === 'mixed';
  const defaultRequireTarget = challengeType !== 'leader_only';

  return {
    requirePersonalGoalOnJoin: layerPolicy.requirePersonalGoalOnJoin ?? defaultRequireGoal,
    requirePersonalTargetOnJoin: layerPolicy.requirePersonalTargetOnJoin ?? defaultRequireTarget,
  };
}

export interface LayerPolicy {
  requirePersonalGoalOnJoin: boolean;
  requirePersonalTargetOnJoin: boolean;
  allowExtraVisibilityToggle: boolean;
}

/** 챌린지 생성 시 layerPolicy 정규화 — 개인퀘스트가 있는 유형은 개인 목표 입력을 강제 */
export function resolveLayerPolicy(challengeType: string, layerPolicy: LayerPolicy): LayerPolicy {
  const isMixed =
    challengeType === 'personal_only' || challengeType === 'leader_personal' || challengeType === 'mixed';
  return {
    requirePersonalGoalOnJoin: isMixed ? true : layerPolicy.requirePersonalGoalOnJoin,
    requirePersonalTargetOnJoin: layerPolicy.requirePersonalTargetOnJoin,
    allowExtraVisibilityToggle: layerPolicy.allowExtraVisibilityToggle,
  };
}

/** personalQuestEnabled 자동 결정 (어드민/생성자가 별도 설정 불가 — 백엔드 강제) */
export function resolvePersonalQuestEnabled(challengeType: string): boolean {
  if (challengeType === 'leader_only') return false;
  return true;
}

// ── 개인 목표시간 변환 (레거시 join 핸들러 추출) ────────────────────────────

export interface PersonalTargetInput {
  hour12: number;
  minute: number;
  meridiem: 'AM' | 'PM';
  timezone: string;
}

function to24Hour(hour12: number, meridiem: 'AM' | 'PM'): number {
  if (meridiem === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export function toTime24(hour12: number, minute: number, meridiem: 'AM' | 'PM'): string {
  const hh = String(to24Hour(hour12, meridiem)).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${hh}:${mm}`;
}

const KST_MS = 9 * 60 * 60 * 1000;

/** 개인퀘스트 제안 마감: challengeStartAt D-1 23:59 KST (레거시 승계) */
export function getProposalDeadline(challengeStartAt?: string): string | null {
  if (!challengeStartAt) return null;
  const start = new Date(challengeStartAt);
  if (Number.isNaN(start.getTime())) return null;
  const kst = new Date(start.getTime() + KST_MS);
  kst.setUTCDate(kst.getUTCDate() - 1);
  kst.setUTCHours(23, 59, 0, 0);
  return new Date(kst.getTime() - KST_MS).toISOString();
}
