import { JoinWizardChallenge } from './types';

export const resolveJoinRequirements = (challenge: JoinWizardChallenge) => {
  const challengeType = String(challenge.challengeType || 'leader_personal');
  const layerPolicy = challenge.layerPolicy || {};

  const defaultRequireGoal = challengeType === 'personal_only' || challengeType === 'mixed';
  const defaultRequireTarget = challengeType !== 'leader_only';

  return {
    requirePersonalGoalOnJoin: layerPolicy.requirePersonalGoalOnJoin ?? defaultRequireGoal,
    requirePersonalTargetOnJoin: layerPolicy.requirePersonalTargetOnJoin ?? defaultRequireTarget,
  };
};
