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
    // {reported, duplicate?, autoHidden?} + 서버 메시지(접수/중복/자동숨김 구분)
    return { ...res.data.data, message: res.data.message as string | undefined };
  },
};
