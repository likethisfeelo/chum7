import { JoinWizardChallenge, WizardFormState, WizardStepConfig } from './types';
import { resolveJoinRequirements } from './requirements';

export const TIME_STEP: WizardStepConfig = {
  id: 'time',
  required: true,
  validate: () => null,
};

export const QUEST_STEP_REQUIRED: WizardStepConfig = {
  id: 'quest',
  required: true,
  validate: (state: WizardFormState) => {
    if (!state.questTitle.trim()) return '퀘스트 제목을 입력해주세요';
    if (!state.questDescription.trim()) return '퀘스트 설명을 입력해주세요';
    return null;
  },
};

export const GOAL_STEP_REQUIRED: WizardStepConfig = {
  id: 'quest',
  required: true,
  validate: (state: WizardFormState) => {
    if (!state.questTitle.trim()) return '개인 목표를 입력해주세요';
    return null;
  },
};

export const QUEST_STEP_OPTIONAL: WizardStepConfig = {
  id: 'quest',
  required: false,
  validate: (state: WizardFormState) => {
    const hasTitle = state.questTitle.trim().length > 0;
    const hasDescription = state.questDescription.trim().length > 0;

    if (!hasTitle && !hasDescription) return null;
    if (!hasTitle) return '퀘스트 제목을 입력해주세요';
    if (!hasDescription) return '퀘스트 설명을 입력해주세요';
    return null;
  },
};

export const CONFIRM_STEP: WizardStepConfig = {
  id: 'confirm',
  required: true,
  validate: () => null,
};

export const resolveWizardSteps = (challenge: JoinWizardChallenge): WizardStepConfig[] => {
  const { requirePersonalGoalOnJoin } = resolveJoinRequirements(challenge);
  const steps: WizardStepConfig[] = [TIME_STEP];

  if (challenge.personalQuestEnabled || requirePersonalGoalOnJoin) {
    const isRequiredQuest = challenge.challengeType === 'personal_only';
    if (isRequiredQuest && challenge.personalQuestEnabled) {
      steps.push(QUEST_STEP_REQUIRED);
    } else if (requirePersonalGoalOnJoin) {
      steps.push(GOAL_STEP_REQUIRED);
    } else {
      steps.push(QUEST_STEP_OPTIONAL);
    }
  }

  steps.push(CONFIRM_STEP);
  return steps;
};
