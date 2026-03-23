import { apiClient } from '@/lib/api-client';

export interface FeedProfile {
  userId: string;
  displayName: string;
  animalIcon: string;
  feedSettings: {
    isPublic: boolean;
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

export const personalFeedApi = {
  getProfile: async (userId: string): Promise<FeedProfile> => {
    const res = await apiClient.get(`/personal-feed/${userId}`);
    return res.data.data;
  },

  getAchievements: async (userId: string): Promise<FeedAchievements> => {
    const res = await apiClient.get(`/personal-feed/${userId}/achievements`);
    return res.data.data;
  },

  getVerifications: async (
    userId: string,
    nextToken?: string,
  ): Promise<{ items: VerificationFeedItem[]; nextToken: string | null }> => {
    const params = nextToken ? `?nextToken=${encodeURIComponent(nextToken)}` : '';
    const res = await apiClient.get(`/personal-feed/${userId}/verifications${params}`);
    return res.data.data;
  },

  getChallengeHistory: async (userId: string): Promise<{ challenges: ChallengeFeedItem[]; total: number }> => {
    const res = await apiClient.get(`/personal-feed/${userId}/challenges`);
    return res.data.data;
  },
};
