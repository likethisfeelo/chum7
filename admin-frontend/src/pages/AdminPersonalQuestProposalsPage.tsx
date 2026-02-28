import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export const AdminPersonalQuestProposalsPage = () => {
  const [challengeId, setChallengeId] = useState('');
  const [status, setStatus] = useState<'pending'|'revision_pending'|'approved'|'rejected'|'expired'>('pending');
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['admin-personal-proposals', challengeId, status],
    queryFn: async () => {
      if (!challengeId.trim()) return [];
      const res = await apiClient.get(`/admin/challenges/${challengeId}/personal-quest-proposals?status=${status}`);
      return res.data.data || [];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ proposalId, action }: { proposalId: string; action: 'approve'|'reject' }) => {
      const payload: any = { action };
      if (action === 'reject') payload.leaderFeedback = feedback[proposalId] || '';
      await apiClient.put(`/admin/personal-quest-proposals/${proposalId}/review`, payload);
    },
    onSuccess: () => refetch(),
  });

  const proposals = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">개인 퀘스트 제안 심사</h1>
      <div className="bg-white border rounded-xl p-4 flex gap-2 items-center">
        <input value={challengeId} onChange={(e) => setChallengeId(e.target.value)} placeholder="challengeId" className="px-3 py-2 border rounded-lg flex-1" />
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="px-3 py-2 border rounded-lg">
          <option value="pending">pending</option>
          <option value="revision_pending">revision_pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="expired">expired</option>
        </select>
        <button onClick={() => refetch()} className="px-3 py-2 bg-slate-900 text-white rounded-lg">조회</button>
      </div>
      {isFetching ? <p>불러오는 중...</p> : proposals.map((p: any) => (
        <div key={p.proposalId} className="bg-white border rounded-xl p-4 space-y-2">
          <p className="font-semibold">{p.title}</p>
          <p className="text-sm text-gray-600">제안자: {p.userId} · 인증: {p.verificationType} · 상태: {p.status}</p>
          <p className="text-xs text-gray-500">반려 횟수: {p.revisionCount || 0}번째 시도</p>
          {(p.status === 'pending' || p.status === 'revision_pending') && (
            <div className="space-y-2">
              <textarea value={feedback[p.proposalId] || ''} onChange={(e) => setFeedback((prev) => ({ ...prev, [p.proposalId]: e.target.value }))} placeholder="반려 사유(10자 이상)" className="w-full px-3 py-2 border rounded-lg" />
              <div className="flex gap-2">
                <button onClick={() => reviewMutation.mutate({ proposalId: p.proposalId, action: 'approve' })} className="px-3 py-1.5 bg-emerald-600 text-white rounded">승인</button>
                <button onClick={() => reviewMutation.mutate({ proposalId: p.proposalId, action: 'reject' })} className="px-3 py-1.5 bg-rose-600 text-white rounded">반려</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
