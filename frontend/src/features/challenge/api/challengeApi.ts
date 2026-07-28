import { apiClient } from '@/lib/api-client';

export type ChallengeCategory =
  | 'selflove' | 'discipline' | 'create' | 'explore'
  | 'build' | 'attitude' | 'expand' | 'impact';

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
  /** 개인 퀘스트 제안 자동승인 (기본 true). false 시 리더 검토 후 승인 */
  personalQuestAutoApprove?: boolean;
}

export interface InterestStatus {
  interested: boolean;
  count: number;
}

export interface QuestProposal {
  proposalId: string;
  challengeId: string;
  userId: string;
  title: string;
  description: string | null;
  status: 'pending' | 'approved' | 'rejected';
  leaderFeedback: string | null;
  createdAt: string;
  updatedAt: string;
}

export const challengeApi = {
  createChallenge: async (params: CreateChallengeParams): Promise<CreatedChallenge> => {
    const res = await apiClient.post('/c/challenges', params);
    return res.data.data as CreatedChallenge;
  },

  getMyCreated: async (): Promise<CreatedChallenge[]> => {
    const res = await apiClient.get('/c/challenges/my-created');
    return (res.data.data?.challenges ?? []) as CreatedChallenge[];
  },

  publishChallenge: async (challengeId: string): Promise<void> => {
    await apiClient.patch(`/c/challenges/${challengeId}/publish`);
  },

  // ── 관심 챌린지 (challenge-api PORTING.md §7-c) ─────────────────────
  toggleInterest: async (challengeId: string): Promise<InterestStatus> => {
    const res = await apiClient.post(`/c/challenges/${challengeId}/interest`);
    return res.data.data as InterestStatus;
  },

  getInterestStatus: async (challengeId: string): Promise<InterestStatus> => {
    const res = await apiClient.get(`/c/challenges/${challengeId}/interest/status`);
    return res.data.data as InterestStatus;
  },

  // ── 개인 퀘스트 제안 (challenge-api PORTING.md §7-e) ─────────────────
  submitQuestProposal: async (
    challengeId: string,
    params: { title: string; description?: string },
  ): Promise<QuestProposal> => {
    const res = await apiClient.post(`/c/challenges/${challengeId}/quest-proposals`, params);
    return res.data.data as QuestProposal;
  },

  getMyQuestProposals: async (
    challengeId: string,
  ): Promise<{ latestProposal: QuestProposal | null; proposals: QuestProposal[] }> => {
    const res = await apiClient.get(`/c/challenges/${challengeId}/quest-proposals/my`);
    return res.data.data;
  },

  // ── 리더 개인 퀘스트 제안 심사 (challenge-api /c/:id/leader/quest-proposals) ──
  getLeaderQuestProposals: async (
    challengeId: string,
    status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending',
  ): Promise<{ proposals: QuestProposal[]; total: number }> => {
    const res = await apiClient.get(
      `/c/${challengeId}/leader/quest-proposals?status=${status}`,
    );
    return res.data.data;
  },

  reviewQuestProposal: async (
    challengeId: string,
    proposalId: string,
    params: { decision: 'approve' | 'reject'; reason?: string },
  ): Promise<{ proposalId: string; status: 'approved' | 'rejected' }> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/quest-proposals/${proposalId}/review`,
      params,
    );
    return res.data.data;
  },

  // 이미 승인(자동승인 포함)된 개인 퀘스트 '제안'을 리더가 다시 반려 (참여자 재제출). 게시물은 건드리지 않음
  reRejectQuestProposal: async (
    challengeId: string,
    proposalId: string,
    params: { reason?: string } = {},
  ): Promise<{ proposalId: string; status: 'rejected' }> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/quest-proposals/${proposalId}/re-reject`,
      { decision: 'reject', ...params },
    );
    return res.data.data;
  },

  // 인증 게시물 1건 반려 — 그날 인증만 반려(피드/마당에서 숨김, 본인 기록엔 남김, 점수 되돌림)
  rejectVerification: async (
    challengeId: string,
    verificationId: string,
    params: { reason?: string } = {},
  ): Promise<{ verificationId: string; rejected: true }> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/verifications/${verificationId}/reject`,
      params,
    );
    return res.data.data;
  },
};
