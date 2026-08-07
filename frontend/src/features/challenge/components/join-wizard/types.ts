export type WizardStepKey = 'time' | 'quest' | 'confirm';

export type QuestVerificationType = 'image' | 'text' | 'link' | 'video';

export interface WizardFormState {
  hour12: number;
  minute: number;
  meridiem: 'AM' | 'PM';
  questTitle: string;
  questDescription: string;
  questAllowedVerificationTypes: QuestVerificationType[];
  questVerificationType?: QuestVerificationType;
  /** leaderIdentityMode=custom 챌린지: 리더에게만 보일 이름 (운영탭 전용, 피드 익명 유지) */
  leaderVisibleName: string;
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
  /** 참여자 식별 방식 — 생성 시 리더 확정 (realname | handle | custom) */
  leaderIdentityMode?: string | null;
}
