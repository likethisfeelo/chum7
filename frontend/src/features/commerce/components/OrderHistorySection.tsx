import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loading } from '@/shared/components/Loading';
import { commerceApi, ORDER_STATUS_META, Order } from '../api/commerceApi';

const formatAmount = (amount: number) => `${Number(amount || 0).toLocaleString('ko-KR')}원`;

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export function OrderHistorySection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => commerceApi.getMyOrders(),
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => commerceApi.cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      toast('주문을 취소했어요', { icon: '🗑️' });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '주문 취소에 실패했습니다');
    },
  });

  const orders: Order[] = data?.orders ?? [];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-500 mb-3">주문 내역</h3>

      {isLoading ? (
        <Loading />
      ) : orders.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">아직 주문 내역이 없어요</p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const meta = ORDER_STATUS_META[order.status] ?? {
              label: order.status,
              badgeClass: 'bg-gray-100 text-gray-500',
            };
            return (
              <div key={order.orderId} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => order.challengeId && navigate(`/challenges/${order.challengeId}`)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {order.challengeTitle || '챌린지'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {formatDate(order.createdAt)} · {order.method === 'coupon' ? '쿠폰' : '무통장 입금'}
                      {order.pricingType === 'paid_deposit' ? ' · 보증금' : ' · 참가비'}
                    </p>
                  </button>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.badgeClass}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs font-bold text-gray-700">{formatAmount(order.amount)}</span>
                  </div>
                </div>
                {order.status === 'awaiting_deposit' && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[11px] text-amber-700">입금 확인 후 참여가 확정돼요</p>
                    <button
                      onClick={() => cancelMutation.mutate(order.orderId)}
                      disabled={cancelMutation.isPending}
                      className="text-[11px] text-gray-500 underline disabled:opacity-40"
                    >
                      주문 취소
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
