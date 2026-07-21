import { apiClient } from '@/lib/api-client';

export interface FeedProfile {
  userId: string;
  feedHandle: string | null;
  displayName: string;
  animalIcon: string;
  isOwn: boolean;
  currentLayer: number;
  followStatus: 'none' | 'pending' | 'accepted';
  isMutual: boolean;
  feedSettings: {
    isPublic: boolean;
    tab02Public: boolean;
  };
}

export interface FeedAchievements {
  challenges: {
    total: number;
    completed: number;
    active: number;
  };
  verifications: {
    total: number;
    totalScore: number;
  };
  cheers: {
    sentCount: number;
    receivedCount: number;
  };
  badges: {
    badgeId: string;
    grantedAt: string;
    challengeId: string | null;
  }[];
  leaderBadges: {
    badgeId: string;
    grantedAt: string;
  }[];
  leaderHistory: {
    total: number;
    completed: number;
    active: number;
    totalParticipants: number;
    recentChallenges: {
      challengeId: string;
      title: string;
      lifecycle: string;
      createdAt: string;
      participantCount: number;
    }[];
  };
}

export interface VerificationFeedItem {
  verificationId: string;
  challengeId: string | null;
  challengeTitle: string | null;
  challengeCategory: string | null;
  day: number | null;
  score: number;
  verificationType: string;
  imageUrl: string | null;
  todayNote: string | null;
  createdAt: string | null;
}

export interface ChallengeFeedItem {
  userChallengeId: string;
  challengeId: string;
  title: string;
  category: string | null;
  badgeIcon: string | null;
  badgeName: string | null;
  durationDays: number;
  completedDays: number;
  score: number;
  bucketState: 'active' | 'completed' | 'gave_up' | 'preparing';
  startDate: string | null;
  challengeStartAt: string | null;
  actualStartAt: string | null;
}

export interface FollowerItem {
  followId: string;
  followerId: string;
  createdAt: string;
}

export interface FollowRequestItem {
  followId: string;
  followerId: string;
  createdAt: string;
}

export interface BlockedItem {
  blockId: string;
  blockedUserId: string;
  createdAt: string;
}

export interface InviteLink {
  inviteLinkId: string;
  token: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface PersonalPost {
  postId: string;
  userId: string;
  content: string;
  imageUrls: (string | null)[];
  visibility: 'private' | 'followers' | 'mutual';
  createdAt: string;
  updatedAt: string;
}

export interface SavedPostItem {
  saveId: string;
  plazaPostId: string;
  savedAt: string;
  postSnapshot: {
    postType: string;
    content: string;
    createdAt: string;
  };
}

export interface FeedNotification {
  notificationId: string;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  relatedId: string;
  relatedType: string;
  deepLink?: string;
  isRead: boolean;
  createdAt: string;
}

export const personalFeedApi = {
  // ── Profile ─────────────────────────────────────────────────────────
  getProfile: async (userId: string): Promise<FeedProfile> => {
    const res = await apiClient.get(`/u/feed/${userId}`);
    return res.data.data;
  },

  // ── Achievements ────────────────────────────────────────────────────
  // NOT_PORTED: GET /personal-feed/{userId}/achievements — 크로스 도메인 read라 신규 user-api에서
  // 미이식 (user-api PORTING.md §2). 도메인별 API 조합으로 대체 전까지 빈 상태 반환.
  getAchievements: async (_userId: string): Promise<FeedAchievements> => {
    return {
      challenges: { total: 0, completed: 0, active: 0 },
      verifications: { total: 0, totalScore: 0 },
      cheers: { sentCount: 0, receivedCount: 0 },
      badges: [],
      leaderBadges: [],
      leaderHistory: { total: 0, completed: 0, active: 0, totalParticipants: 0, recentChallenges: [] },
    };
  },

  // ── Verifications ───────────────────────────────────────────────────
  // NOT_PORTED: GET /personal-feed/{userId}/verifications — challenge-api 소관으로 미이식
  // (user-api PORTING.md §1). 대체 표면 제공 전까지 빈 목록 반환.
  getVerifications: async (
    _userId: string,
    _nextToken?: string,
  ): Promise<{ items: VerificationFeedItem[]; nextToken: string | null }> => {
    return { items: [], nextToken: null };
  },

  // ── Challenges ──────────────────────────────────────────────────────
  // NOT_PORTED: GET /personal-feed/{userId}/challenges — challenge-api 소관으로 미이식
  // (user-api PORTING.md §1). 대체 표면 제공 전까지 빈 목록 반환.
  getChallengeHistory: async (_userId: string): Promise<{ challenges: ChallengeFeedItem[]; total: number }> => {
    return { challenges: [], total: 0 };
  },

  // ── Follow ──────────────────────────────────────────────────────────
  sendFollowRequest: async (userId: string): Promise<{ followId: string; status: string }> => {
    const res = await apiClient.post(`/u/feed/${userId}/follow-request`);
    return res.data.data;
  },

  acceptFollowRequest: async (followId: string): Promise<void> => {
    await apiClient.put(`/u/feed/follow-requests/${followId}/accept`);
  },

  rejectFollowRequest: async (followId: string): Promise<void> => {
    await apiClient.put(`/u/feed/follow-requests/${followId}/reject`);
  },

  unfollow: async (userId: string): Promise<void> => {
    await apiClient.delete(`/u/feed/${userId}/follow`);
  },

  removeFollower: async (followerId: string): Promise<void> => {
    await apiClient.delete(`/u/feed/followers/${followerId}`);
  },

  getFollowers: async (): Promise<{ followers: FollowerItem[] }> => {
    const res = await apiClient.get('/u/feed/me/followers');
    return res.data.data;
  },

  getFollowRequests: async (): Promise<{ requests: FollowRequestItem[] }> => {
    const res = await apiClient.get('/u/feed/me/follow-requests');
    return res.data.data;
  },

  // ── Block ───────────────────────────────────────────────────────────
  blockUser: async (userId: string): Promise<void> => {
    await apiClient.post(`/u/feed/${userId}/block`);
  },

  unblockUser: async (userId: string): Promise<void> => {
    await apiClient.delete(`/u/feed/${userId}/block`);
  },

  getBlockedList: async (): Promise<{ blocked: BlockedItem[] }> => {
    const res = await apiClient.get('/u/feed/me/blocked');
    return res.data.data;
  },

  // ── Invite Links ────────────────────────────────────────────────────
  createInviteLink: async (params?: {
    maxUses?: number;
    expiresAt?: string;
  }): Promise<InviteLink> => {
    const res = await apiClient.post('/u/feed/me/invite-links', params ?? {});
    return res.data.data;
  },

  getInviteLinks: async (): Promise<{ links: InviteLink[] }> => {
    const res = await apiClient.get('/u/feed/me/invite-links');
    return res.data.data;
  },

  deleteInviteLink: async (linkId: string): Promise<void> => {
    await apiClient.delete(`/u/feed/me/invite-links/${linkId}`);
  },

  resolveInviteToken: async (token: string): Promise<{ ownerId: string; inviteLinkId: string }> => {
    const res = await apiClient.get(`/u/feed/invite/${token}`);
    return res.data.data;
  },

  // ── Feed Settings ───────────────────────────────────────────────────
  updateFeedSettings: async (settings: { isPublic?: boolean; tab02Public?: boolean }): Promise<void> => {
    await apiClient.put('/u/feed/me/settings', settings);
  },

  // ── Personal Posts ──────────────────────────────────────────────────
  // NOT_PORTED: POST /personal-feed/me/posts/upload-url — S3 presign 미배선으로 신규 user-api에서
  // 미이식 (user-api PORTING.md §2). 이미지 첨부는 비활성 — 호출 시 에러로 조용히 스킵됨.
  getPostUploadUrl: async (_contentType: string): Promise<{ uploadUrl: string; key: string }> => {
    throw new Error('이미지 업로드는 아직 지원되지 않아요');
  },

  createPost: async (params: {
    content: string;
    imageKeys?: string[];
    visibility: 'private' | 'followers' | 'mutual';
  }): Promise<{ postId: string; visibility: string; createdAt: string }> => {
    const res = await apiClient.post('/u/feed/me/posts', params);
    return res.data.data;
  },

  getPosts: async (
    userId: string,
    nextToken?: string,
  ): Promise<{ posts: PersonalPost[]; nextToken: string | null }> => {
    const params = nextToken ? `?nextToken=${encodeURIComponent(nextToken)}` : '';
    const res = await apiClient.get(`/u/feed/${userId}/posts${params}`);
    return res.data.data;
  },

  updatePost: async (
    postId: string,
    params: { content?: string; imageKeys?: string[]; visibility?: string },
  ): Promise<void> => {
    await apiClient.put(`/u/feed/me/posts/${postId}`, params);
  },

  deletePost: async (postId: string): Promise<void> => {
    await apiClient.delete(`/u/feed/me/posts/${postId}`);
  },

  // ── Saved Posts ─────────────────────────────────────────────────────
  savePlazaPost: async (plazaPostId: string): Promise<{ saveId: string; savedAt: string }> => {
    const res = await apiClient.post(`/u/feed/plaza/${plazaPostId}/save`);
    return res.data.data;
  },

  unsavePlazaPost: async (plazaPostId: string): Promise<void> => {
    await apiClient.delete(`/u/feed/plaza/${plazaPostId}/save`);
  },

  getPlazaPostSaveStatus: async (plazaPostId: string): Promise<{ saved: boolean; saveId: string | null }> => {
    const res = await apiClient.get(`/u/feed/plaza/${plazaPostId}/save/status`);
    return res.data.data;
  },

  getSavedPosts: async (
    nextToken?: string,
  ): Promise<{ savedPosts: SavedPostItem[]; nextToken: string | null }> => {
    const params = nextToken ? `?nextToken=${encodeURIComponent(nextToken)}` : '';
    const res = await apiClient.get(`/u/feed/me/saved-posts${params}`);
    return res.data.data;
  },

  // ── Feed Handle ─────────────────────────────────────────────────────
  updateFeedHandle: async (handle: string): Promise<{ feedHandle: string }> => {
    const res = await apiClient.put('/u/feed/me/handle', { handle });
    return res.data.data;
  },

  // ── Notifications ────────────────────────────────────────────────────
  getNotifications: async (includeRead = false): Promise<FeedNotification[]> => {
    const res = await apiClient.get(`/u/notifications${includeRead ? '?includeRead=true' : ''}`);
    // 신규 API는 { notifications, nextToken } 형태 (user-api PORTING.md — 의도적 변경). 구형 배열도 방어적으로 허용.
    const data = res.data.data;
    return Array.isArray(data) ? data : data?.notifications ?? [];
  },

  markNotificationRead: async (notificationId: string): Promise<void> => {
    await apiClient.post('/u/notifications/read', { notificationId });
  },
};
