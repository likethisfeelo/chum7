import { apiClient } from '@/lib/api-client';

export type ChallengeCategory =
  | 'health' | 'habit' | 'development' | 'creativity'
  | 'relationship' | 'mindfulness' | 'expand' | 'impact';

export type ChallengeType = 'leader_only' | 'personal_only' | 'leader_personal' | 'mixed';
export type ChallengeLifecycle = 'draft' | 'recruiting' | 'preparing' | 'active' | 'completed' | 'archived';

export interface CreatedChallenge {
  challengeId: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  lifecycle: ChallengeLifecycle;
  recruitingStartAt: string;
  recruitingEndAt: string;
  challengeStartAt: string;
  challengeEndAt: string;
  durationDays: number;
  maxParticipants: number | null;
  badgeIcon: string;
  badgeName: string;
  stats: {
    totalParticipants: number;
    activeParticipants: number;
    pendingParticipants?: number;
    completionRate: number;
  };
  createdAt: string;
  createdBy: string;
}

export interface CreateChallengeParams {
  title: string;
  description: string;
  category: ChallengeCategory;
  targetTime: string;         // "HH:MM"
  identityKeyword: string;
  badgeIcon: string;
  badgeName: string;
  recruitingStartAt: string;  // ISO datetime
  recruitingEndAt: string;
  challengeStartAt: string;
  durationDays: number;
  maxParticipants?: number | null;
  challengeType: ChallengeType;
  joinApprovalRequired: boolean;
  allowedVerificationTypes: Array<'image' | 'text' | 'link' | 'video'>;
  participateAsCreator: boolean;
}

export const challengeApi = {
  createChallenge: async (params: CreateChallengeParams): Promise<CreatedChallenge> => {
    const res = await apiClient.post('/challenges/me/create', params);
    return res.data.data as CreatedChallenge;
  },

  getMyCreated: async (): Promise<CreatedChallenge[]> => {
    const res = await apiClient.get('/challenges/me/created');
    return (res.data.data?.challenges ?? []) as CreatedChallenge[];
  },

  publishChallenge: async (challengeId: string): Promise<void> => {
    await apiClient.patch(`/challenges/${challengeId}/publish`);
  },
};
