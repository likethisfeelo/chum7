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

export const personalFeedApi = {
  getProfile: async (userId: string): Promise<FeedProfile> => {
    const res = await apiClient.get(`/personal-feed/${userId}`);
    return res.data.data;
  },
  getAchievements: async (userId: string): Promise<FeedAchievements> => {
    const res = await apiClient.get(`/personal-feed/${userId}/achievements`);
    return res.data.data;
  },
};
