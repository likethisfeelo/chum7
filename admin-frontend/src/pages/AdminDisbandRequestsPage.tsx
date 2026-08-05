import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

const FILTER_TABS = [
  { key: 'pending', label: '대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
] as const;

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-gray-200 text-gray-600',
};

type DisbandRequest = {
  requestId: string;
  challengeId: string;
  challengeTitle?: string | null;
  leaderId: string;
  reason: string;
  pricingType?: string | null;
  status: string;
  createdAt: string;
  reviewedAt?: string | null;
  reviewReason?: string | null;
};

export const AdminDisbandRequestsPage = () => {
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [msg, setMsg] = useState('');
  const qc = useQueryClient();

  const { data: requests = [], isLoading, isError } = useQuery({
    queryKey: ['admin-disband-requests', statusFilter],
    queryFn: async () => {
      const res = await apiClient.get(`/adm/challenges/disband-requests?status=${statusFilter}`);
      return res.data.data.requests as DisbandRequest[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-disband-requests'] });

  const resolveMutation = useMutation({
    mutationFn: async ({ r, decision, reason }: { r: DisbandRequest; decision: 'approve' | 'reject'; reason?: string }) => {
      await apiClient.put(`/adm/challenges/disband-requests/${r.requestId}`, {
        challengeId: r.challengeId,
        decision,
        reason,
      });
    },
    onSuccess: (_d, vars) => {
      setMsg(vars.decision === 'approve' ? '승인하고 챌린지를 해산했어요. 환불은 커머스에서 별도 처리하세요.' : '해산 신청을 반려했어요.');
      setTimeout(() => setMsg(''), 4000);
      invalidate();
    },
    onError: (err: any) => setMsg(err?.response?.data?.message || '처리에 실패했어요. 권한/상태를 확인하세요.'),
  });

  const busyId = resolveMutation.isPending ? resolveMutation.variables?.r.requestId : null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">해산 신청 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          유료 챌린지 리더의 해산 신청을 검토합니다. 승인하면 챌린지가 즉시 해산되며, <b>환불은 커머스에서 별도 처리</b>해야 합니다.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {FILTER_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              statusFilter === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-emerald-600 font-medium mb-3">{msg}</p>}
      {isLoading && <p className="text-sm text-gray-500">불러오는 중...</p>}
      {isError && <p className="text-sm text-red-500">목록을 불러오지 못했습니다.</p>}
      {!isLoading && requests.length === 0 && (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-400">
          신청이 없습니다.
        </div>
      )}

      <div className="space-y-3">
        {requests.map((r) => {
          const busy = busyId === r.requestId;
          return (
            <div key={r.requestId} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? 'bg-gray-100'}`}>
                  {FILTER_TABS.find((t) => t.key === r.status)?.label ?? r.status}
                </span>
                <span className="text-sm font-semibold text-gray-800">{r.challengeTitle || '(제목 없음)'}</span>
                {r.pricingType && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{r.pricingType}</span>
                )}
                <span className="ml-auto text-[11px] text-gray-400">{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">사유: {r.reason}</p>
              <p className="text-[11px] text-gray-400 mt-1 break-all">
                challenge: {r.challengeId} · leader: {r.leaderId}
              </p>
              {r.reviewReason && <p className="text-[11px] text-gray-500 mt-1">검토 메모: {r.reviewReason}</p>}

              {r.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      if (window.confirm(`'${r.challengeTitle || r.challengeId}' 챌린지를 해산할까요? 되돌릴 수 없습니다. (환불은 커머스에서 별도 처리)`)) {
                        resolveMutation.mutate({ r, decision: 'approve' });
                      }
                    }}
                    disabled={busy}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    승인 + 해산
                  </button>
                  <button
                    onClick={() => {
                      const reason = window.prompt('반려 사유 (리더에게 전달, 선택)') ?? undefined;
                      resolveMutation.mutate({ r, decision: 'reject', reason: reason?.trim() || undefined });
                    }}
                    disabled={busy}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    반려
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
