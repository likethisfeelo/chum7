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
  /** 완주 보상 — 실물 상품 지급(선택) */
  rewardPhysical?: { name: string } | null;
  /** 완주 보상 — 온라인 상품(기프티콘 등) 지급(선택) */
  rewardOnline?: { name: string } | null;
  /** 대표 이미지(배너 카드) URL — 없으면 카테고리 컬러 카드 */
  coverImageUrl?: string | null;
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

  // 대표 이미지 업로드 — presigned PUT (verifications upload-url 재사용). 반환: CloudFront fileUrl
  uploadCoverImage: async (file: File): Promise<string> => {
    const res = await apiClient.post('/c/verifications/upload-url', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      mediaKind: 'image',
    });
    const { uploadUrl, fileUrl } = res.data.data as { uploadUrl: string; fileUrl: string };
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    if (!put.ok) throw new Error('UPLOAD_FAILED');
    return fileUrl;
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

  // 이미 승인(자동승인 포함)된 개인 퀘스트 '제안'을 리더가 다시 반려 (참여자 재제출).
  // fallback = 시작 전 재제출 미이행 시 처리: 'block'(참여 제한) | 'keep_original'(기존 제출본 유지)
  reRejectQuestProposal: async (
    challengeId: string,
    proposalId: string,
    params: { reason?: string; fallback: 'block' | 'keep_original' },
  ): Promise<{ proposalId: string; status: 'rejected'; fallback: 'block' | 'keep_original' }> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/quest-proposals/${proposalId}/re-reject`,
      params,
    );
    return res.data.data;
  },

  // ── 공통 리더퀘스트 등록 (challenge-api /c/:id/leader/quests) ──────────────
  createLeaderQuest: async (
    challengeId: string,
    params: {
      title: string;
      description: string;
      allowedVerificationTypes?: Array<'image' | 'text' | 'link' | 'video'>;
      verificationGuide?: string;
      approvalRequired?: boolean;
      rewardPoints?: number;
      targetTime?: string; // "HH:MM"
    },
  ): Promise<{ questId: string; title: string }> => {
    const res = await apiClient.post(`/c/${challengeId}/leader/quests`, params);
    return res.data.data;
  },

  // 퀘스트 목록 조회 (GET /c/:id/quests?status=). 리더 관리용은 status='all'.
  listQuests: async (challengeId: string, status: string = 'active'): Promise<any[]> => {
    const res = await apiClient.get(`/c/${challengeId}/quests?status=${encodeURIComponent(status)}`);
    return res.data.data?.quests ?? [];
  },

  // 리더퀘스트 관리 목록 — 상태 무관 + 실제 인증(questId 연결) 수 포함
  listLeaderQuests: async (challengeId: string): Promise<any[]> => {
    const res = await apiClient.get(`/c/${challengeId}/leader/quests`);
    return res.data.data?.quests ?? [];
  },

  // ── 리더퀘스트 수정 / 중단·재개 (PUT /c/:id/leader/quests/:questId) ──────────
  updateLeaderQuest: async (
    challengeId: string,
    questId: string,
    params: {
      title?: string;
      description?: string;
      allowedVerificationTypes?: Array<'image' | 'text' | 'link' | 'video'>;
      verificationGuide?: string;
      approvalRequired?: boolean;
      rewardPoints?: number;
      targetTime?: string;
      status?: 'active' | 'inactive';
    },
  ): Promise<any> => {
    const res = await apiClient.put(`/c/${challengeId}/leader/quests/${questId}`, params);
    return res.data.data;
  },

  // 리더퀘스트 삭제 (DELETE /c/:id/leader/quests/:questId)
  deleteLeaderQuest: async (
    challengeId: string,
    questId: string,
  ): Promise<{ questId: string; deleted: true }> => {
    const res = await apiClient.delete(`/c/${challengeId}/leader/quests/${questId}`);
    return res.data.data;
  },

  // 인증을 다른 리더퀘스트로 이동 — 잘못된 퀘스트에 올린 인증 재배정(점수 유지)
  moveLeaderQuestVerification: async (
    challengeId: string,
    verificationId: string,
    toQuestId: string,
  ): Promise<{ verificationId: string; questId: string }> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/verifications/${verificationId}/move-quest`,
      { toQuestId },
    );
    return res.data.data;
  },

  // 게시물별 '완료 인정' — 해당 날짜를 리더가 수동 완료(성공·+1점) 처리 (보수용)
  grantVerificationComplete: async (
    challengeId: string,
    verificationId: string,
  ): Promise<{ verificationId: string; day: number; granted: boolean }> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/verifications/${verificationId}/grant-complete`,
    );
    return res.data.data;
  },

  // '완료 인정' 취소 — 수동 완료 해제 후 규칙으로 재판정
  revokeVerificationComplete: async (
    challengeId: string,
    verificationId: string,
  ): Promise<{ verificationId: string; day: number; granted: boolean }> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/verifications/${verificationId}/revoke-complete`,
    );
    return res.data.data;
  },

  // 참여자×날짜 그리드 — 특정 참여자의 특정 day를 완료 인정/취소 (게시물 없이도)
  grantDayComplete: async (challengeId: string, participantId: string, day: number): Promise<any> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/participants/${participantId}/days/${day}/grant`,
    );
    return res.data.data;
  },
  revokeDayComplete: async (challengeId: string, participantId: string, day: number): Promise<any> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/participants/${participantId}/days/${day}/revoke`,
    );
    return res.data.data;
  },
  // 그리드 리뷰 — 특정 참여자·특정 day의 인증 게시물 목록
  getParticipantDayVerifications: async (
    challengeId: string,
    participantId: string,
    day: number,
  ): Promise<any[]> => {
    const res = await apiClient.get(
      `/c/${challengeId}/leader/participants/${participantId}/days/${day}/verifications`,
    );
    return res.data.data?.verifications ?? [];
  },

  // 그리드 3단계 상태 지정 — 완료(complete)/일부(partial)/취소·미완(none)
  setDayState: async (
    challengeId: string,
    participantId: string,
    day: number,
    state: 'complete' | 'partial' | 'none',
  ): Promise<any> => {
    const res = await apiClient.put(
      `/c/${challengeId}/leader/participants/${participantId}/days/${day}/set-state`,
      { state },
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
