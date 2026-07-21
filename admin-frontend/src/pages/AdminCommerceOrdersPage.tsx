import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ko } from 'date-fns/locale';

// 커머스 v0 주문/입금 확인 콘솔 — /pay/admin/orders (슈퍼어드민 admins 전용)
type OrderStatus = 'awaiting_deposit' | 'paid' | 'rejected' | 'canceled' | 'expired';

type Order = {
  orderId: string;
  userId: string;
  challengeId: string;
  challengeTitle?: string | null;
  amount: number;
  pricingType: 'paid_fee' | 'paid_deposit';
  method: 'coupon' | 'manual_deposit';
  status: OrderStatus;
  couponCode?: string | null;
  depositorName?: string | null;
  memo?: string | null;
  createdAt: string;
  paidAt?: string | null;
  resolvedBy?: string | null;
};

type LedgerEntry = { sk?: string; event?: string; actorUserId?: string; at?: string; detail?: unknown };

const STATUS_TABS: Array<{ key: OrderStatus; label: string }> = [
  { key: 'awaiting_deposit', label: '입금 대기' },
  { key: 'paid', label: '결제 완료' },
  { key: 'rejected', label: '거절됨' },
  { key: 'canceled', label: '취소됨' },
  { key: 'expired', label: '만료됨' },
];

const STATUS_BADGE: Record<OrderStatus, { label: string; cls: string }> = {
  awaiting_deposit: { label: '입금 대기', cls: 'bg-amber-100 text-amber-700' },
  paid:             { label: '결제 완료', cls: 'bg-green-100 text-green-700' },
  rejected:         { label: '거절됨',   cls: 'bg-red-100 text-red-700' },
  canceled:         { label: '취소됨',   cls: 'bg-gray-200 text-gray-600' },
  expired:          { label: '만료됨',   cls: 'bg-gray-100 text-gray-500' },
};

const METHOD_LABEL: Record<string, string> = { coupon: '쿠폰', manual_deposit: '무통장 입금' };

const won = (n: number) => `${Number(n ?? 0).toLocaleString('ko-KR')}원`;

const formatDate = (iso?: string | null) => {
  if (!iso) return '-';
  try { return format(new Date(iso), 'yy.MM.dd HH:mm:ss', { locale: ko }); } catch { return iso; }
};

const elapsed = (iso: string) => {
  try { return formatDistanceToNowStrict(new Date(iso), { locale: ko }) + ' 경과'; } catch { return '-'; }
};

export const AdminCommerceOrdersPage = () => {
  const qc = useQueryClient();
  const [statusTab, setStatusTab] = useState<OrderStatus>('awaiting_deposit');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [memo, setMemo] = useState('');

  const { data: orders, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-commerce-orders', statusTab],
    queryFn: async () => {
      const res = await apiClient.get(`/pay/admin/orders?status=${statusTab}`);
      return (res.data?.data?.orders ?? []) as Order[];
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin-commerce-order-detail', selectedOrderId],
    enabled: Boolean(selectedOrderId),
    queryFn: async () => {
      const res = await apiClient.get(`/pay/admin/orders/${selectedOrderId}`);
      return res.data?.data as { order: Order; ledger: LedgerEntry[] };
    },
    retry: false,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ orderId, action }: { orderId: string; action: 'confirm' | 'reject' }) => {
      const body = memo.trim() ? { memo: memo.trim() } : {};
      const res = await apiClient.post(`/pay/admin/orders/${orderId}/${action}`, body);
      return res.data;
    },
    onSuccess: (res) => {
      alert(res?.message || '처리되었습니다');
      setMemo('');
      qc.invalidateQueries({ queryKey: ['admin-commerce-orders'] });
      qc.invalidateQueries({ queryKey: ['admin-commerce-order-detail', selectedOrderId] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || '처리에 실패했습니다');
    },
  });

  const handleResolve = (order: Order, action: 'confirm' | 'reject') => {
    const label = action === 'confirm' ? '입금 확인(paid 전환)' : '거절';
    const lines = [
      `주문 ${order.orderId.slice(0, 8)}… 을(를) ${label} 처리할까요?`,
      `주문자: ${order.userId}`,
      `금액: ${won(order.amount)} · 입금자명: ${order.depositorName || '-'}`,
      memo.trim() ? `메모: ${memo.trim()}` : '메모: (없음)',
    ];
    if (!window.confirm(lines.join('\n'))) return;
    resolveMutation.mutate({ orderId: order.orderId, action });
  };

  const detailOrder = detail?.order;
  const ledger = detail?.ledger ?? [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">주문/입금 관리</h1>
          <p className="text-sm text-gray-500 mt-1">무통장 입금 대기 큐를 확인하고 수동으로 입금 확인/거절 처리합니다.</p>
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

      {/* 상태 탭 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setStatusTab(tab.key); setSelectedOrderId(''); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              statusTab === tab.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4 items-start">
        {/* 주문 테이블 */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">주문을 불러오는 중...</div>
          ) : (orders?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-4xl mb-3">📭</p>
              <p>{STATUS_BADGE[statusTab].label} 상태의 주문이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">주문자</th>
                    <th className="text-left px-4 py-3 font-semibold">챌린지</th>
                    <th className="text-right px-4 py-3 font-semibold">금액</th>
                    <th className="text-left px-4 py-3 font-semibold">입금자명</th>
                    <th className="text-left px-4 py-3 font-semibold">결제 방식</th>
                    <th className="text-left px-4 py-3 font-semibold">경과 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {(orders ?? []).map((o) => (
                    <tr
                      key={o.orderId}
                      onClick={() => { setSelectedOrderId(o.orderId); setMemo(''); }}
                      className={`border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${
                        selectedOrderId === o.orderId ? 'bg-primary-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{o.userId.slice(0, 10)}…</td>
                      <td className="px-4 py-3 text-gray-900 max-w-[180px] truncate" title={o.challengeTitle ?? o.challengeId}>
                        {o.challengeTitle || o.challengeId.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{won(o.amount)}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{o.depositorName || '-'}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{METHOD_LABEL[o.method] ?? o.method}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{elapsed(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 상세 패널 */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 sticky top-6">
          {!selectedOrderId ? (
            <p className="text-sm text-gray-400 text-center py-10">주문 행을 클릭하면 상세와 원장 타임라인이 표시됩니다.</p>
          ) : detailLoading || !detailOrder ? (
            <p className="text-sm text-gray-500 text-center py-10">상세를 불러오는 중...</p>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-bold text-gray-900">주문 상세</h2>
                  <p className="font-mono text-xs text-gray-500 mt-0.5 break-all">{detailOrder.orderId}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[detailOrder.status]?.cls ?? 'bg-gray-100 text-gray-700'}`}>
                  {STATUS_BADGE[detailOrder.status]?.label ?? detailOrder.status}
                </span>
              </div>

              <div className="text-sm text-gray-700 space-y-1.5">
                <p><span className="text-gray-500">주문자:</span> <span className="font-mono text-xs">{detailOrder.userId}</span></p>
                <p><span className="text-gray-500">챌린지:</span> {detailOrder.challengeTitle || detailOrder.challengeId}</p>
                <p><span className="text-gray-500">금액:</span> <span className="font-semibold">{won(detailOrder.amount)}</span> ({detailOrder.pricingType === 'paid_deposit' ? '보증금' : '참가비'})</p>
                <p><span className="text-gray-500">결제 방식:</span> {METHOD_LABEL[detailOrder.method] ?? detailOrder.method}</p>
                {detailOrder.method === 'manual_deposit' && (
                  <p><span className="text-gray-500">입금자명:</span> {detailOrder.depositorName || '-'}</p>
                )}
                {detailOrder.couponCode && (
                  <p><span className="text-gray-500">쿠폰:</span> <span className="font-mono text-xs">{detailOrder.couponCode}</span></p>
                )}
                <p><span className="text-gray-500">주문 시각:</span> {formatDate(detailOrder.createdAt)}</p>
                {detailOrder.paidAt && <p><span className="text-gray-500">결제 확인:</span> {formatDate(detailOrder.paidAt)}</p>}
                {detailOrder.memo && <p><span className="text-gray-500">메모:</span> {detailOrder.memo}</p>}
              </div>

              {/* 원장 타임라인 */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">원장 타임라인 (append-only)</h3>
                {ledger.length === 0 ? (
                  <p className="text-xs text-gray-400">원장 기록이 없습니다.</p>
                ) : (
                  <ol className="relative border-l border-gray-200 ml-1.5 space-y-3">
                    {ledger.map((entry, idx) => (
                      <li key={entry.sk ?? idx} className="ml-4">
                        <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-primary-500" />
                        <p className="text-sm font-medium text-gray-900">{entry.event ?? '-'}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(entry.at)}
                          {entry.actorUserId ? ` · ${String(entry.actorUserId).slice(0, 10)}…` : ''}
                        </p>
                        {entry.detail ? (
                          <p className="text-[11px] text-gray-400 font-mono break-all">{JSON.stringify(entry.detail)}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* 입금 확인 / 거절 */}
              {detailOrder.status === 'awaiting_deposit' && (
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  <label className="block text-xs text-gray-500">처리 메모 (선택, 최대 200자)</label>
                  <input
                    value={memo}
                    maxLength={200}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="예: 07/21 14:20 국민은행 입금 확인"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleResolve(detailOrder, 'confirm')}
                      disabled={resolveMutation.isPending}
                      className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                    >
                      {resolveMutation.isPending ? '처리 중...' : '입금 확인'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolve(detailOrder, 'reject')}
                      disabled={resolveMutation.isPending}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                    >
                      거절
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
