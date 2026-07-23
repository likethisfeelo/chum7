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
  isFriend?: boolean;
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
  // gamification-api PORTING.md §7 — 퍼블릭 업적 (레거시 personal-feed/achievements 형태 승계)
  getAchievements: async (userId: string): Promise<FeedAchievements> => {
    const res = await apiClient.get(`/public/users/${userId}/achievements`);
    return res.data.data;
  },

  // ── Verifications ───────────────────────────────────────────────────
  // challenge-api PORTING.md §7-a — 퍼블릭 인증 목록 (공개 인증만 노출)
  getVerifications: async (
    userId: string,
    nextToken?: string,
  ): Promise<{ items: VerificationFeedItem[]; nextToken: string | null }> => {
    const params = nextToken ? `?nextToken=${encodeURIComponent(nextToken)}` : '';
    const res = await apiClient.get(`/public/users/${userId}/verifications${params}`);
    return res.data.data;
  },

  // ── Challenges ──────────────────────────────────────────────────────
  // challenge-api PORTING.md §7-b — 퍼블릭 챌린지 이력 (완주분만 노출)
  getChallengeHistory: async (userId: string): Promise<{ challenges: ChallengeFeedItem[]; total: number }> => {
    const res = await apiClient.get(`/public/users/${userId}/challenge-history`);
    return res.data.data;
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
  // user-api PORTING.md §6 — 자유글 이미지 presigned PUT 업로드
  getPostUploadUrl: async (
    contentType: string,
    fileName?: string,
    fileSize?: number,
  ): Promise<{ uploadUrl: string; key: string; fileUrl: string }> => {
    const res = await apiClient.post('/u/feed/me/posts/upload-url', {
      contentType,
      ...(fileName ? { fileName } : {}),
      ...(fileSize != null ? { fileSize } : {}),
    });
    return res.data.data;
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
