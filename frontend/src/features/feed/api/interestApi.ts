import { apiClient } from '@/lib/api-client';

/** 관심영역(리더+카테고리) 구독 — 좋아요 시 자동 생성, 사용자는 on/off·삭제만. */
export interface InterestSubscription {
  leaderId: string;
  category: string;
  categoryLabel: string;
  name: string;
  enabled: boolean;
  count: number;
  sampleChallengeId: string | null;
  sampleChallengeTitle: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const interestApi = {
  list: async (): Promise<InterestSubscription[]> => {
    const res = await apiClient.get('/s/interest-subscriptions');
    return (res.data?.data?.subscriptions ?? []) as InterestSubscription[];
  },

  setEnabled: async (leaderId: string, category: string, enabled: boolean): Promise<void> => {
    await apiClient.patch('/s/interest-subscriptions', { leaderId, category, enabled });
  },

  remove: async (leaderId: string, category: string): Promise<void> => {
    const params = new URLSearchParams({ leaderId, category });
    await apiClient.delete(`/s/interest-subscriptions?${params.toString()}`);
  },
};
