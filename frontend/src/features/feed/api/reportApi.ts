import { apiClient } from '@/lib/api-client';

export interface ReportTarget {
  targetType: 'verification' | 'plaza' | 'comment';
  targetId: string;
  challengeId?: string | null;
  plazaPostId?: string | null;
  commentCreatedAt?: string | null;
}

export const reportApi = {
  submit: async (payload: ReportTarget & { reason: string; detail?: string }) => {
    const res = await apiClient.post('/s/reports', payload);
    return res.data.data;
  },
};
