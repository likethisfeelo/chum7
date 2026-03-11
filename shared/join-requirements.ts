export interface LayerPolicyInput {
  requirePersonalGoalOnJoin?: boolean;
  requirePersonalTargetOnJoin?: boolean;
}

export interface JoinRequirementResult {
  requirePersonalGoalOnJoin: boolean;
  requirePersonalTargetOnJoin: boolean;
}

export function resolveJoinRequirements(challengeTypeRaw?: string, layerPolicyRaw?: LayerPolicyInput | null): JoinRequirementResult {
  const challengeType = String(challengeTypeRaw || 'leader_personal');
  const layerPolicy = layerPolicyRaw || {};
  const defaultRequireGoal = challengeType === 'personal_only' || challengeType === 'leader_personal' || challengeType === 'mixed';
  const defaultRequireTarget = challengeType !== 'leader_only';

  return {
    requirePersonalGoalOnJoin: layerPolicy.requirePersonalGoalOnJoin ?? defaultRequireGoal,
    requirePersonalTargetOnJoin: layerPolicy.requirePersonalTargetOnJoin ?? defaultRequireTarget,
  };
}
