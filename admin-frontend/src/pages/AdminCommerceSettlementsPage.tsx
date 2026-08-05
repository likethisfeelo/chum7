import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

// 커머스 v0 반환/정산 콘솔 — /pay/admin/refunds, /pay/admin/settlements (슈퍼어드민 admins 전용)
// settlement-worker가 챌린지 종료 시 만든 반환 대기·정산서를 수동 송금 후 완료 처리한다.

type Refund = {
  orderId: string;
  userId: string;
  challengeId: string;
  challengeTitle?: string | null;
  amount: number;
  status: 'refund_due' | 'completed';
  createdAt: string;
  completedAt?: string | null;
  completedBy?: string | null;
  memo?: string | null;
};

type Settlement = {
  challengeId: string;
  creatorId: string;
  challengeTitle?: string | null;
  pricingType: 'paid_fee' | 'paid_deposit';
  orderCount: number;
  refundDueCount: number;
  grossAmount: number;
  platformFee: number;
  payoutAmount: number;
  status: 'held' | 'ready' | 'paid';
  createdAt: string;
  holdUntil?: string | null;
  releasedAt?: string | null;
  paidAt?: string | null;
  paidBy?: string | null;
  memo?: string | null;
};

const holdRemainingLabel = (holdUntil?: string | null): string => {
  if (!holdUntil) return '';
  const ms = new Date(holdUntil).getTime() - Date.now();
  if (ms <= 0) return '해제 가능';
  const days = Math.ceil(ms / 86_400_000);
  return `${days}일 남음`;
};

type Tab = 'refund_due' | 'refund_completed' | 'settlements';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'refund_due', label: '반환 대기' },
  { key: 'refund_completed', label: '반환 완료' },
  { key: 'settlements', label: '정산' },
];

const PRICING_LABEL: Record<string, string> = { paid_fee: '참가비형', paid_deposit: '보증금형' };

const won = (n: number) => `${Number(n ?? 0).toLocaleString('ko-KR')}원`;

const formatDate = (iso?: string | null) => {
  if (!iso) return '-';
  try { return format(new Date(iso), 'yy.MM.dd HH:mm', { locale: ko }); } catch { return iso; }
};

export const AdminCommerceSettlementsPage = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('refund_due');

  const refundStatus = tab === 'refund_completed' ? 'completed' : 'refund_due';
  const { data: refunds, isLoading: refundsLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-commerce-refunds', refundStatus],
    enabled: tab !== 'settlements',
    queryFn: async () => {
      const res = await apiClient.get(`/pay/admin/refunds?status=${refundStatus}`);
      return (res.data?.data?.refunds ?? []) as Refund[];
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: settlements, isLoading: settlementsLoading } = useQuery({
    queryKey: ['admin-commerce-settlements'],
    enabled: tab === 'settlements',
    queryFn: async () => {
      const [held, ready, paid] = await Promise.all([
        apiClient.get('/pay/admin/settlements?status=held'),
        apiClient.get('/pay/admin/settlements?status=ready'),
        apiClient.get('/pay/admin/settlements?status=paid'),
      ]);
      return [
        ...((held.data?.data?.settlements ?? []) as Settlement[]),
        ...((ready.data?.data?.settlements ?? []) as Settlement[]),
        ...((paid.data?.data?.settlements ?? []) as Settlement[]),
      ];
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const completeRefundMutation = useMutation({
    mutationFn: async ({ orderId, memo }: { orderId: string; memo: string }) => {
      const res = await apiClient.post(`/pay/admin/refunds/${orderId}/complete`, memo ? { memo } : {});
      return res.data;
    },
    onSuccess: (res) => {
      alert(res?.message || '반환 완료 처리되었습니다');
      qc.invalidateQueries({ queryKey: ['admin-commerce-refunds'] });
    },
    onError: (err: any) => alert(err?.response?.data?.message || '처리에 실패했습니다'),
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ challengeId, memo }: { challengeId: string; memo: string }) => {
      const res = await apiClient.post(`/pay/admin/settlements/${challengeId}/mark-paid`, memo ? { memo } : {});
      return res.data;
    },
    onSuccess: (res) => {
      alert(res?.message || '지급 완료 처리되었습니다');
      qc.invalidateQueries({ queryKey: ['admin-commerce-settlements'] });
    },
    onError: (err: any) => alert(err?.response?.data?.message || '처리에 실패했습니다'),
  });

  const releaseMutation = useMutation({
    mutationFn: async ({ challengeId, memo, force }: { challengeId: string; memo: string; force: boolean }) => {
      const res = await apiClient.post(`/pay/admin/settlements/${challengeId}/release`, { ...(memo ? { memo } : {}), ...(force ? { force: true } : {}) });
      return res.data;
    },
    onSuccess: (res) => {
      alert(res?.message || '보류를 해제했습니다');
      qc.invalidateQueries({ queryKey: ['admin-commerce-settlements'] });
    },
    onError: (err: any) => alert(err?.response?.data?.message || '처리에 실패했습니다'),
  });

  const handleRelease = (s: Settlement) => {
    const remain = holdRemainingLabel(s.holdUntil);
    const elapsed = remain === '해제 가능' || !s.holdUntil;
    const lines = [
      elapsed
        ? '환불 보류를 해제하고 지급 대기로 전환할까요?'
        : `아직 환불 보류 기간입니다 (${remain}). 조기 강제 해제할까요?`,
      `챌린지: ${s.challengeTitle || s.challengeId}`,
      `해제 예정: ${formatDate(s.holdUntil)}`,
      `지급 예정액: ${won(s.payoutAmount)}`,
    ];
    if (!window.confirm(lines.join('\n'))) return;
    const memo = window.prompt('처리 메모 (선택, 최대 200자)', '');
    if (memo === null) return;
    releaseMutation.mutate({ challengeId: s.challengeId, memo: memo.trim().slice(0, 200), force: !elapsed });
  };

  // 확인 다이얼로그 + 메모 입력 — 확인 후 prompt 취소 시 중단
  const handleCompleteRefund = (r: Refund) => {
    const lines = [
      '보증금 반환을 완료 처리할까요? (실제 계좌이체를 먼저 진행하세요)',
      `주문: ${r.orderId.slice(0, 8)}… · 주문자: ${r.userId}`,
      `챌린지: ${r.challengeTitle || r.challengeId}`,
      `반환 금액: ${won(r.amount)}`,
    ];
    if (!window.confirm(lines.join('\n'))) return;
    const memo = window.prompt('처리 메모 (선택, 최대 200자)', '');
    if (memo === null) return;
    completeRefundMutation.mutate({ orderId: r.orderId, memo: memo.trim().slice(0, 200) });
  };

  const handleMarkPaid = (s: Settlement) => {
    const lines = [
      '크리에이터 정산 지급을 완료 처리할까요? (실제 계좌이체를 먼저 진행하세요)',
      `챌린지: ${s.challengeTitle || s.challengeId}`,
      `크리에이터: ${s.creatorId}`,
      `총액 ${won(s.grossAmount)} − 수수료 ${won(s.platformFee)} = 지급액 ${won(s.payoutAmount)}`,
    ];
    if (!window.confirm(lines.join('\n'))) return;
    const memo = window.prompt('처리 메모 (선택, 최대 200자)', '');
    if (memo === null) return;
    markPaidMutation.mutate({ challengeId: s.challengeId, memo: memo.trim().slice(0, 200) });
  };

  const emptyBox = (message: string) => (
    <div className="p-8 text-center text-gray-400">
      <p className="text-4xl mb-3">📭</p>
      <p>{message}</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">반환/정산 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            챌린지 종료 후 생성된 보증금 반환 대기와 크리에이터 정산서를 수동 이체 후 완료 처리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-50"
        >
          {isFetching ? '갱신 중...' : '새로고침'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'settlements' ? (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {refundsLoading ? (
            <div className="p-8 text-center text-gray-500">반환 목록을 불러오는 중...</div>
          ) : (refunds?.length ?? 0) === 0 ? (
            emptyBox(tab === 'refund_due' ? '반환 대기 건이 없습니다.' : '반환 완료 건이 없습니다.')
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">주문자</th>
                    <th className="text-left px-4 py-3 font-semibold">챌린지</th>
                    <th className="text-right px-4 py-3 font-semibold">반환 금액</th>
                    <th className="text-left px-4 py-3 font-semibold">생성 시각</th>
                    {tab === 'refund_due' ? (
                      <th className="text-right px-4 py-3 font-semibold">처리</th>
                    ) : (
                      <>
                        <th className="text-left px-4 py-3 font-semibold">완료 시각</th>
                        <th className="text-left px-4 py-3 font-semibold">메모</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(refunds ?? []).map((r) => (
                    <tr key={r.orderId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{r.userId.slice(0, 10)}…</td>
                      <td className="px-4 py-3 text-gray-900 max-w-[220px] truncate" title={r.challengeTitle ?? r.challengeId}>
                        {r.challengeTitle || r.challengeId.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{won(r.amount)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                      {tab === 'refund_due' ? (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleCompleteRefund(r)}
                            disabled={completeRefundMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                          >
                            {completeRefundMutation.isPending ? '처리 중...' : '반환 완료'}
                          </button>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(r.completedAt)}</td>
                          <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate" title={r.memo ?? ''}>{r.memo || '-'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {settlementsLoading ? (
            <div className="p-8 text-center text-gray-500">정산서를 불러오는 중...</div>
          ) : (settlements?.length ?? 0) === 0 ? (
            emptyBox('생성된 정산서가 없습니다.')
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">챌린지</th>
                    <th className="text-left px-4 py-3 font-semibold">크리에이터</th>
                    <th className="text-left px-4 py-3 font-semibold">유형</th>
                    <th className="text-right px-4 py-3 font-semibold">총액</th>
                    <th className="text-right px-4 py-3 font-semibold">수수료</th>
                    <th className="text-right px-4 py-3 font-semibold">지급액</th>
                    <th className="text-left px-4 py-3 font-semibold">상태</th>
                    <th className="text-right px-4 py-3 font-semibold">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {(settlements ?? []).map((s) => (
                    <tr key={s.challengeId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 max-w-[200px] truncate" title={s.challengeTitle ?? s.challengeId}>
                        {s.challengeTitle || s.challengeId.slice(0, 10)}
                        <span className="block text-[11px] text-gray-400">
                          주문 {s.orderCount}건{s.refundDueCount > 0 ? ` · 반환 ${s.refundDueCount}건` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{s.creatorId.slice(0, 10)}…</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{PRICING_LABEL[s.pricingType] ?? s.pricingType}</td>
                      <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{won(s.grossAmount)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{won(s.platformFee)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{won(s.payoutAmount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {s.status === 'held' ? (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-200 text-gray-700">
                            환불 보류
                            <span className="block text-[10px] font-normal">{holdRemainingLabel(s.holdUntil)}</span>
                          </span>
                        ) : s.status === 'ready' ? (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700">지급 대기</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">
                            지급 완료
                            <span className="block text-[10px] font-normal">{formatDate(s.paidAt)}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.status === 'held' && (
                          <button
                            type="button"
                            onClick={() => handleRelease(s)}
                            disabled={releaseMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs font-semibold hover:bg-gray-900 disabled:opacity-50"
                          >
                            {releaseMutation.isPending ? '처리 중...' : '보류 해제'}
                          </button>
                        )}
                        {s.status === 'ready' && (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(s)}
                            disabled={markPaidMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 disabled:opacity-50"
                          >
                            {markPaidMutation.isPending ? '처리 중...' : '지급 완료'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
