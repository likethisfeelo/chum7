import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: '검토중', cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '승인', cls: 'bg-green-100 text-green-800' },
  rejected: { label: '반려', cls: 'bg-red-100 text-red-800' },
};

const FILTER_TABS = ['pending', 'approved', 'rejected', 'all'] as const;
type FilterTab = typeof FILTER_TABS[number];

interface Proposal {
  proposalId: string;
  challengeId: string;
  userId: string;
  title: string;
  description: string | null;
  status: string;
  leaderFeedback: string | null;
  createdAt: string;
  updatedAt: string;
}

const formatDate = (iso?: string) => (iso ? format(new Date(iso), 'M월 d일 HH:mm', { locale: ko }) : '-');
const maskUserId = (userId: string) => (userId?.length > 10 ? `${userId.slice(0, 10)}…` : userId);

export const AdminQuestProposalsPage = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<FilterTab>('pending');
  const [challengeFilter, setChallengeFilter] = useState(searchParams.get('challengeId') ?? '');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const { data: challengeData } = useQuery({
    queryKey: ['admin-proposal-challenges'],
    queryFn: async () => {
      try {
        const mine = await apiClient.get('/adm/challenges/mine');
        const myChallenges = mine.data?.data?.challenges ?? [];
        if (Array.isArray(myChallenges) && myChallenges.length > 0) return myChallenges;
      } catch {
        // fallback below
      }
      const res = await apiClient.get('/public/challenges?sortBy=latest&limit=200');
      return res.data?.data?.challenges ?? [];
    },
    retry: false,
  });

  const challengeOptions = useMemo(() => {
    const map = new Map<string, string>();
    (challengeData ?? []).forEach((challenge: any) => {
      if (challenge?.challengeId) map.set(challenge.challengeId, challenge.title ?? '제목 없음');
    });
    return Array.from(map.entries()).map(([challengeId, title]) => ({ challengeId, title }));
  }, [challengeData]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-quest-proposals', statusFilter, challengeFilter],
    enabled: Boolean(challengeFilter),
    queryFn: async () => {
      const params = new URLSearchParams({ challengeId: challengeFilter, status: statusFilter });
      const res = await apiClient.get(`/adm/quest-proposals?${params}`);
      return res.data?.data ?? { proposals: [], total: 0 };
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ proposalId, decision, reason }: { proposalId: string; decision: 'approve' | 'reject'; reason?: string }) => {
      const res = await apiClient.put(`/adm/quest-proposals/${proposalId}/review`, {
        challengeId: challengeFilter,
        decision,
        reason,
      });
      return res.data;
    },
    onSuccess: () => {
      setRejectingId(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-quest-proposals'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || '처리에 실패했습니다');
    },
  });

  const proposals: Proposal[] = data?.proposals ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">📝 개인 퀘스트 제안 심사</h1>
        <p className="text-sm text-slate-500 mt-1">참여자가 제안한 개인 퀘스트를 승인/반려합니다. (기본 자동승인 — 수동검토 챌린지·재검토용)</p>
      </div>

      {/* 챌린지 선택 */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-slate-500 mb-1">챌린지</label>
        <select
          value={challengeFilter}
          onChange={(e) => setChallengeFilter(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
        >
          <option value="">챌린지를 선택하세요</option>
          {challengeOptions.map((c) => (
            <option key={c.challengeId} value={c.challengeId}>{c.title}</option>
          ))}
        </select>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
        {FILTER_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setStatusFilter(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t === 'all' ? '전체' : STATUS_LABEL[t]?.label ?? t}
          </button>
        ))}
      </div>

      {!challengeFilter ? (
        <p className="text-sm text-slate-500 py-10 text-center">먼저 챌린지를 선택하세요.</p>
      ) : isLoading ? (
        <p className="text-sm text-slate-500 py-10 text-center">불러오는 중...</p>
      ) : proposals.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">
          {statusFilter === 'pending' ? '대기 중인 제안이 없습니다. (기본 자동승인)' : '제안이 없습니다.'}
        </p>
      ) : (
        <div className="space-y-2">
          {isFetching && <p className="text-[11px] text-slate-400">갱신 중...</p>}
          {proposals.map((p) => {
            const meta = STATUS_LABEL[p.status] ?? { label: p.status, cls: 'bg-slate-100 text-slate-600' };
            const isRejecting = rejectingId === p.proposalId;
            const isPending = p.status === 'pending';
            return (
              <div key={p.proposalId} className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-slate-900">{p.title}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                </div>
                <p className="text-[11px] text-slate-400">{maskUserId(p.userId)} · {formatDate(p.updatedAt)}</p>
                {p.description && (
                  <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap break-words">{p.description}</p>
                )}
                {p.leaderFeedback && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-2">💬 {p.leaderFeedback}</p>
                )}

                {isPending && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    {isRejecting ? (
                      <div className="space-y-2">
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="반려 사유(선택)"
                          maxLength={500}
                          className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-red-300"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={reviewMutation.isPending}
                            onClick={() => reviewMutation.mutate({ proposalId: p.proposalId, decision: 'reject', reason: reason.trim() || undefined })}
                            className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 text-white disabled:opacity-50"
                          >
                            반려 확정
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRejectingId(null); setReason(''); }}
                            className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 text-slate-600 bg-white"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={reviewMutation.isPending}
                          onClick={() => reviewMutation.mutate({ proposalId: p.proposalId, decision: 'approve' })}
                          className="px-4 py-2 text-sm font-semibold rounded-xl bg-green-600 text-white disabled:opacity-50"
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRejectingId(p.proposalId); setReason(''); }}
                          className="px-4 py-2 text-sm font-medium rounded-xl border border-red-200 text-red-600 bg-white"
                        >
                          반려
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminQuestProposalsPage;
