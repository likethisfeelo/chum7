import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// 커머스 티켓 배부 콘솔 — /pay/admin/ticket-batches (슈퍼어드민 admins 전용)
// 유료 챌린지 리더에게 참여 티켓 할당량을 배부한다. 리더는 운영탭에서 유저에게 발급.

type TicketBatch = {
  batchId: string;
  challengeId: string;
  challengeTitle?: string | null;
  leaderId: string;
  total: number;
  issued: number;
  createdAt: string;
};

export const AdminCommerceTicketsPage = () => {
  const qc = useQueryClient();
  const [challengeId, setChallengeId] = useState('');
  const [total, setTotal] = useState('10');
  const [queryChallengeId, setQueryChallengeId] = useState('');
  const [msg, setMsg] = useState('');

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['admin-ticket-batches', queryChallengeId],
    enabled: Boolean(queryChallengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/pay/admin/ticket-batches?challengeId=${encodeURIComponent(queryChallengeId)}`);
      return (res.data?.data?.batches ?? []) as TicketBatch[];
    },
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/pay/admin/ticket-batches', {
        challengeId: challengeId.trim(),
        total: Number(total),
      });
      return res.data;
    },
    onSuccess: (res) => {
      setMsg(res?.message || '티켓을 배부했습니다');
      setTimeout(() => setMsg(''), 4000);
      setQueryChallengeId(challengeId.trim());
      qc.invalidateQueries({ queryKey: ['admin-ticket-batches'] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message || '배부에 실패했습니다'),
  });

  const totalNum = Number(total);
  const canIssue = challengeId.trim().length > 0 && Number.isInteger(totalNum) && totalNum >= 1 && totalNum <= 500;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">참여 티켓 배부</h1>
        <p className="text-sm text-gray-500 mt-1">
          유료 챌린지 리더에게 참여 티켓 할당량을 배부합니다. 리더는 운영 탭에서 유저에게 발급하며,
          유저가 사용하면 <b>결제와 동일 효력(0원 주문)</b>으로 참여가 확정됩니다.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-800">새 배부</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={challengeId}
            onChange={(e) => setChallengeId(e.target.value)}
            placeholder="챌린지 ID"
            className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono"
          />
          <input
            value={total}
            onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="장수"
            className="w-24 px-3 py-2 rounded-lg border border-gray-300 text-sm text-right"
          />
          <button
            type="button"
            disabled={!canIssue || issueMutation.isPending}
            onClick={() => {
              if (window.confirm(`챌린지 ${challengeId.trim()} 리더에게 티켓 ${totalNum}장을 배부할까요?`)) {
                issueMutation.mutate();
              }
            }}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {issueMutation.isPending ? '배부 중...' : '배부'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400">리더는 챌린지 생성자(createdBy)로 자동 지정됩니다. 1~500장.</p>
        {msg && <p className="text-sm text-emerald-600 font-medium">{msg}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-800">배부 내역 조회</p>
        <div className="flex gap-2">
          <input
            value={queryChallengeId}
            onChange={(e) => setQueryChallengeId(e.target.value)}
            placeholder="챌린지 ID로 조회"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono"
          />
        </div>
        {!queryChallengeId ? (
          <p className="text-xs text-gray-400">챌린지 ID를 입력하면 배부 내역이 표시됩니다.</p>
        ) : isLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-gray-400">배부 내역이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <div key={b.batchId} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{b.challengeTitle || b.challengeId}</p>
                  <p className="text-[11px] text-gray-400 font-mono">leader: {b.leaderId.slice(0, 12)}… · {new Date(b.createdAt).toLocaleString('ko-KR')}</p>
                </div>
                <span className="text-sm font-bold text-gray-800 whitespace-nowrap">
                  {b.issued} / {b.total}장
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
