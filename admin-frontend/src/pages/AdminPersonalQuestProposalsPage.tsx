import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

const STATUS_OPTIONS = [
  { value: 'pending',          label: '심사 대기' },
  { value: 'revision_pending', label: '수정 대기' },
  { value: 'approved',         label: '승인됨' },
  { value: 'rejected',         label: '반려됨' },
  { value: 'expired',          label: '만료됨' },
] as const;

type ProposalStatus = typeof STATUS_OPTIONS[number]['value'];

const VERIFICATION_LABEL: Record<string, string> = {
  image: '사진',
  link:  'URL',
  text:  '텍스트',
  video: '영상',
};

export const AdminPersonalQuestProposalsPage = () => {
  const [challengeId, setChallengeId] = useState('');
  const [status, setStatus] = useState<ProposalStatus>('pending');
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  // 챌린지 목록 조회
  const { data: challengeData } = useQuery({
    queryKey: ['admin-personal-proposals-challenges'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/admin/challenges/mine');
        const mine = res.data?.data?.challenges ?? [];
        if (Array.isArray(mine) && mine.length > 0) return mine;
      } catch {
        // fallback
      }
      const res = await apiClient.get('/challenges?sortBy=latest&limit=200');
      return res.data?.data?.challenges ?? [];
    },
    retry: false,
  });

  const challengeOptions = useMemo(() => {
    return (challengeData ?? [])
      .filter((c: any) => c?.challengeId)
      .map((c: any) => ({ challengeId: c.challengeId, title: c.title ?? '제목 없음' }));
  }, [challengeData]);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['admin-personal-proposals', challengeId, status],
    queryFn: async () => {
      if (!challengeId) return [];
      const res = await apiClient.get(`/admin/challenges/${challengeId}/personal-quest-proposals?status=${status}`);
      return res.data.data || [];
    },
    enabled: Boolean(challengeId),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ proposalId, action }: { proposalId: string; action: 'approve' | 'reject' }) => {
      if (action === 'reject') {
        const fb = (feedback[proposalId] || '').trim();
        if (fb.length < 10) throw new Error('반려 사유를 10자 이상 입력해주세요');
      }
      const payload: any = { action };
      if (action === 'reject') payload.leaderFeedback = (feedback[proposalId] || '').trim();
      await apiClient.put(`/admin/personal-quest-proposals/${proposalId}/review`, payload);
    },
    onSuccess: () => refetch(),
    onError: (err: any) => {
      alert(err?.message || err?.response?.data?.message || '처리에 실패했습니다');
    },
  });

  const proposals = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">개인 퀘스트 제안 심사</h1>

      {/* 필터 영역 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">챌린지 선택 *</label>
          <select
            value={challengeId}
            onChange={(e) => setChallengeId(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
          >
            <option value="">챌린지를 선택하세요</option>
            {challengeOptions.map((c) => (
              <option key={c.challengeId} value={c.challengeId}>{c.title}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium text-gray-700">상태:</span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                status === opt.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={!challengeId || isFetching}
            className="ml-auto px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm disabled:opacity-50"
          >
            {isFetching ? '조회 중...' : '조회'}
          </button>
        </div>
      </div>

      {/* 챌린지 미선택 안내 */}
      {!challengeId && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium">챌린지를 선택하면 제안 목록이 표시됩니다</p>
        </div>
      )}

      {/* 로딩 */}
      {isFetching && challengeId && (
        <div className="text-sm text-gray-500 py-4 text-center">불러오는 중...</div>
      )}

      {/* 빈 상태 */}
      {!isFetching && challengeId && proposals.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
          <p className="text-3xl mb-2">📭</p>
          <p>{STATUS_OPTIONS.find(o => o.value === status)?.label} 제안이 없습니다</p>
        </div>
      )}

      {/* 제안 목록 */}
      {!isFetching && proposals.map((p: any) => (
        <div key={p.proposalId} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-900">{p.title}</p>
            <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
              p.status === 'approved'  ? 'bg-green-100 text-green-700' :
              p.status === 'rejected'  ? 'bg-red-100 text-red-700' :
              p.status === 'expired'   ? 'bg-gray-100 text-gray-500' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {STATUS_OPTIONS.find(o => o.value === p.status)?.label ?? p.status}
            </span>
          </div>

          {p.description && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{p.description}</p>
          )}

          <p className="text-sm text-gray-600">
            제안자: {p.userId} · 인증: {VERIFICATION_LABEL[p.verificationType] ?? p.verificationType}
          </p>
          {p.revisionCount > 0 && (
            <p className="text-xs text-amber-700">반려 후 재제안 {p.revisionCount}회</p>
          )}

          {(p.status === 'pending' || p.status === 'revision_pending') && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <textarea
                value={feedback[p.proposalId] || ''}
                onChange={(e) => setFeedback((prev) => ({ ...prev, [p.proposalId]: e.target.value }))}
                placeholder="반려 사유 (반려 시 10자 이상 필수)"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => reviewMutation.mutate({ proposalId: p.proposalId, action: 'approve' })}
                  disabled={reviewMutation.isPending}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  승인
                </button>
                <button
                  onClick={() => {
                    const fb = (feedback[p.proposalId] || '').trim();
                    if (fb.length < 10) {
                      alert('반려 사유를 10자 이상 입력해주세요');
                      return;
                    }
                    reviewMutation.mutate({ proposalId: p.proposalId, action: 'reject' });
                  }}
                  disabled={reviewMutation.isPending}
                  className="px-4 py-1.5 bg-rose-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  반려
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
