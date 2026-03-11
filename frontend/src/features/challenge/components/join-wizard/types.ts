export type WizardStepKey = 'time' | 'quest' | 'confirm';

export type QuestVerificationType = 'image' | 'text' | 'link' | 'video';

export interface WizardFormState {
  hour12: number;
  minute: number;
  meridiem: 'AM' | 'PM';
  questTitle: string;
  questDescription: string;
  questVerificationType: QuestVerificationType;
}

export interface WizardStepConfig {
  id: WizardStepKey;
  required: boolean;
  validate: (state: WizardFormState) => string | null;
}

export interface JoinWizardChallenge {
  challengeType?: string;
  layerPolicy?: {
    requirePersonalGoalOnJoin?: boolean;
    requirePersonalTargetOnJoin?: boolean;
  } | null;
  personalQuestEnabled?: boolean;
  personalQuestAutoApprove?: boolean;
  title?: string;
  badgeIcon?: string;
  targetTime?: string;
  startDate?: string;
  startAt?: string;
  challengeStartAt?: string;
  recruitEndDate?: string;
  recruitEndAt?: string;
  recruitmentEndAt?: string;
  allowedVerificationTypes?: string[];
}
