import { resolveJoinRequirements as resolveSharedJoinRequirements } from '../../../../../../shared/join-requirements';
import { JoinWizardChallenge } from './types';

export const resolveJoinRequirements = (challenge: JoinWizardChallenge) =>
  resolveSharedJoinRequirements(challenge.challengeType, challenge.layerPolicy);
