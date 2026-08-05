import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BottomSheet } from '@/shared/components/BottomSheet';
import { commerceApi, Order } from '../api/commerceApi';

interface PaymentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  challenge: {
    challengeId?: string;
    title?: string;
    badgeIcon?: string;
    price?: number;
    pricingType?: string;
  };
  /** 결제(주문 paid)가 확정되면 orderId와 함께 호출 — 호출측이 join을 이어간다 */
  onPaid: (orderId: string) => void;
  joining?: boolean;
}

type PaymentMode = 'select' | 'coupon' | 'deposit' | 'awaiting' | 'ticket';

const formatPrice = (price?: number) =>
  typeof price === 'number' && price > 0 ? `${price.toLocaleString('ko-KR')}원` : '';

export const PaymentSheet = ({ isOpen, onClose, challenge, onPaid, joining }: PaymentSheetProps) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<PaymentMode>('select');
  const [couponCode, setCouponCode] = useState('');
  const [depositorName, setDepositorName] = useState('');
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [guideMessage, setGuideMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode('select');
    setCouponCode('');
    setDepositorName('');
    setPendingOrder(null);
    setGuideMessage(null);
    setTicketMessage('');
  }, [isOpen]);

  // 내 티켓/신청 상태 — 이 챌린지의 미사용 티켓이 있으면 '티켓으로 참여' 노출
  const { data: myTicketsData } = useQuery({
    queryKey: ['my-tickets'],
    enabled: isOpen,
    queryFn: () => commerceApi.getMyTickets(),
  });
  const offeredTicket = (myTicketsData?.tickets ?? []).find(
    (t) => t.challengeId === challenge.challengeId && t.status === 'offered',
  );
  const { data: myTicketRequest } = useQuery({
    queryKey: ['my-ticket-request', challenge.challengeId],
    enabled: isOpen && Boolean(challenge.challengeId) && !offeredTicket,
    queryFn: () => commerceApi.getMyTicketRequest(String(challenge.challengeId)),
  });

  const useTicketMutation = useMutation({
    mutationFn: () => commerceApi.useTicket(offeredTicket!.ticketId),
    onSuccess: ({ orderId }) => {
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      toast.success('티켓을 사용했어요! 참여를 이어갈게요 🎫');
      onPaid(orderId);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '티켓 사용에 실패했습니다');
    },
  });

  const [ticketMessage, setTicketMessage] = useState('');
  const requestTicketMutation = useMutation({
    mutationFn: () => commerceApi.requestTicket(String(challenge.challengeId), ticketMessage.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-ticket-request', challenge.challengeId] });
      toast.success('티켓 신청을 보냈어요. 리더 승인 후 알림으로 알려드릴게요');
      setMode('select');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '티켓 신청에 실패했습니다');
    },
  });

  // 입금 대기 주문 상태 폴링 — paid로 바뀌면 참여 완료 버튼 활성화
  const { data: polledOrder } = useQuery({
    queryKey: ['commerce-order', pendingOrder?.orderId],
    queryFn: () => commerceApi.getOrder(pendingOrder!.orderId),
    enabled: isOpen && mode === 'awaiting' && Boolean(pendingOrder?.orderId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'awaiting_deposit' || status == null ? 5000 : false;
    },
  });

  const orderStatus = polledOrder?.status ?? pendingOrder?.status ?? null;

  const couponMutation = useMutation({
    mutationFn: () =>
      commerceApi.createOrder({
        challengeId: String(challenge.challengeId),
        method: 'coupon',
        couponCode: couponCode.trim().toUpperCase(),
      }),
    onSuccess: ({ order }) => {
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-coupons'] });
      toast.success('쿠폰이 적용되었어요! 참여를 이어갈게요 🎟️');
      onPaid(order.orderId);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '쿠폰 적용에 실패했습니다');
    },
  });

  const depositMutation = useMutation({
    mutationFn: () =>
      commerceApi.createOrder({
        challengeId: String(challenge.challengeId),
        method: 'manual_deposit',
        depositorName: depositorName.trim(),
      }),
    onSuccess: ({ order, guide }) => {
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      setPendingOrder(order);
      setGuideMessage(guide?.message ?? null);
      setMode('awaiting');
      toast.success('주문이 접수되었어요. 입금 확인을 기다려주세요');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '주문 접수에 실패했습니다');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => commerceApi.cancelOrder(pendingOrder!.orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      toast('주문을 취소했어요', { icon: '🗑️' });
      setPendingOrder(null);
      setMode('select');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '주문 취소에 실패했습니다');
    },
  });

  const priceLabel = formatPrice(challenge.price);
  const pricingLabel = challenge.pricingType === 'paid_deposit' ? '보증금' : '참가비';

  const renderHeaderCard = () => (
    <div className="p-4 bg-gray-50 rounded-2xl mb-4">
      <p className="text-sm text-gray-500">유료 챌린지</p>
      <p className="text-base font-bold text-gray-900 mt-1">
        {challenge.badgeIcon || '🎯'} {challenge.title || '챌린지'}
      </p>
      {priceLabel && (
        <p className="text-sm text-primary-700 font-semibold mt-1">
          {pricingLabel} {priceLabel}
          {challenge.pricingType === 'paid_deposit' && (
            <span className="text-xs text-gray-500 font-normal ml-1">완주하면 전액 반환</span>
          )}
        </p>
      )}
    </div>
  );

  const renderSelect = () => (
    <div className="space-y-3">
      {offeredTicket ? (
        <button
          type="button"
          onClick={() => useTicketMutation.mutate()}
          disabled={useTicketMutation.isPending || joining}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-primary-300 bg-primary-50 hover:bg-primary-100 text-left transition-colors disabled:opacity-50"
        >
          <span className="text-2xl">🎫</span>
          <div className="flex-1">
            <p className="font-semibold text-primary-800 text-sm">
              {useTicketMutation.isPending ? '티켓 사용 중...' : '받은 티켓으로 바로 참여'}
            </p>
            <p className="text-xs text-primary-600 mt-0.5">리더가 발급한 참여 티켓이 있어요 (결제와 동일 효력)</p>
          </div>
          <span className="text-primary-500">→</span>
        </button>
      ) : myTicketRequest?.status === 'pending' ? (
        <div className="w-full flex items-center gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50">
          <span className="text-2xl">🎫</span>
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">티켓 신청 검토 중</p>
            <p className="text-xs text-amber-600 mt-0.5">리더가 승인하면 알림으로 알려드릴게요</p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMode('ticket')}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-left transition-colors"
        >
          <span className="text-2xl">🎫</span>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 text-sm">리더에게 티켓 신청</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {myTicketRequest?.status === 'rejected' ? '이전 신청이 반려됐어요. 다시 신청할 수 있어요' : '참여 티켓을 요청해요. 승인되면 무료로 참여할 수 있어요'}
            </p>
          </div>
          <span className="text-gray-400">→</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => setMode('coupon')}
        className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-left transition-colors"
      >
        <span className="text-2xl">🎟️</span>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">쿠폰 코드 입력</p>
          <p className="text-xs text-gray-500 mt-0.5">입장권 쿠폰이 있다면 즉시 참여할 수 있어요</p>
        </div>
        <span className="text-gray-400">→</span>
      </button>

      <button
        type="button"
        onClick={() => setMode('deposit')}
        className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-left transition-colors"
      >
        <span className="text-2xl">🏦</span>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">무통장 입금 신청</p>
          <p className="text-xs text-gray-500 mt-0.5">입금 확인 후 참여가 확정돼요 (72시간 이내)</p>
        </div>
        <span className="text-gray-400">→</span>
      </button>
    </div>
  );

  const renderTicketRequest = () => (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">리더에게 남길 메시지 (선택)</label>
        <textarea
          value={ticketMessage}
          onChange={(e) => setTicketMessage(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="참여하고 싶은 이유나 나를 알릴 한마디를 남겨보세요"
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm resize-none"
        />
        <p className="text-xs text-gray-400 mt-2">리더가 승인하면 티켓이 발급되고 알림으로 알려드려요.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('select')}
          disabled={requestTicketMutation.isPending}
          className="px-3 py-3 rounded-xl border border-gray-300 text-sm disabled:opacity-40"
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => requestTicketMutation.mutate()}
          disabled={requestTicketMutation.isPending}
          className="px-3 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          {requestTicketMutation.isPending ? '신청 중...' : '티켓 신청하기 🎫'}
        </button>
      </div>
    </div>
  );

  const renderCoupon = () => (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">쿠폰 코드</label>
        <input
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
          placeholder="CHME-XXXXXXXX"
          maxLength={20}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl font-mono tracking-wide uppercase"
        />
        <p className="text-xs text-gray-400 mt-2">발급받은 입장권 쿠폰 코드를 입력해주세요</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('select')}
          disabled={couponMutation.isPending}
          className="px-3 py-3 rounded-xl border border-gray-300 text-sm disabled:opacity-40"
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => {
            if (!couponCode.trim()) {
              toast.error('쿠폰 코드를 입력해주세요');
              return;
            }
            couponMutation.mutate();
          }}
          disabled={couponMutation.isPending}
          className="px-3 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          {couponMutation.isPending ? '확인 중...' : '쿠폰 사용하기'}
        </button>
      </div>
    </div>
  );

  const renderDeposit = () => (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">입금자명</label>
        <input
          value={depositorName}
          onChange={(e) => setDepositorName(e.target.value)}
          placeholder="입금하실 분의 이름"
          maxLength={30}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl"
        />
        <p className="text-xs text-gray-400 mt-2">
          입금 계좌는 챌린지 소개 안내를 확인해주세요. 입금 확인 후 참여가 확정됩니다.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode('select')}
          disabled={depositMutation.isPending}
          className="px-3 py-3 rounded-xl border border-gray-300 text-sm disabled:opacity-40"
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => {
            if (!depositorName.trim()) {
              toast.error('입금자명을 입력해주세요');
              return;
            }
            depositMutation.mutate();
          }}
          disabled={depositMutation.isPending}
          className="px-3 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          {depositMutation.isPending ? '접수 중...' : '입금 신청하기'}
        </button>
      </div>
    </div>
  );

  const renderAwaiting = () => {
    const isPaid = orderStatus === 'paid';
    const isClosed = orderStatus === 'rejected' || orderStatus === 'canceled' || orderStatus === 'expired';
    return (
      <div className="space-y-4">
        <div
          className={`p-4 rounded-2xl border text-center ${
            isPaid ? 'bg-green-50 border-green-200' : isClosed ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <span className="text-3xl block mb-2">{isPaid ? '✅' : isClosed ? '⚠️' : '⏳'}</span>
          <p className="font-bold text-gray-900 text-sm">
            {isPaid
              ? '입금이 확인되었어요!'
              : isClosed
                ? '주문이 종료되었어요'
                : '주문 접수 완료 — 입금 대기 중'}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {isPaid
              ? '이제 챌린지 참여를 완료할 수 있어요.'
              : isClosed
                ? '주문 내역에서 상태를 확인하고 다시 시도해주세요.'
                : guideMessage || '입금 확인 후 참여가 가능해집니다. 확인되면 자동으로 알려드릴게요.'}
          </p>
          {!isPaid && !isClosed && (
            <p className="text-[11px] text-gray-400 mt-2">이 화면을 닫아도 주문은 유지돼요 (마이 탭 · 주문 내역)</p>
          )}
        </div>

        {isPaid ? (
          <button
            type="button"
            onClick={() => pendingOrder && onPaid(pendingOrder.orderId)}
            disabled={joining}
            className="w-full px-3 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-40"
          >
            {joining ? '참여 처리 중...' : '참여 완료하기 🚀'}
          </button>
        ) : isClosed ? (
          <button
            type="button"
            onClick={() => {
              setPendingOrder(null);
              setMode('select');
            }}
            className="w-full px-3 py-3 rounded-xl border border-gray-300 text-sm"
          >
            다른 방법으로 결제하기
          </button>
        ) : (
          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="w-full px-3 py-3 rounded-xl border border-gray-300 text-sm text-gray-600 disabled:opacity-40"
          >
            {cancelMutation.isPending ? '취소 중...' : '주문 취소하기'}
          </button>
        )}
      </div>
    );
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="결제하고 참여하기 💳">
      <div className="px-6 pb-8">
        {renderHeaderCard()}
        {mode === 'select' && renderSelect()}
        {mode === 'ticket' && renderTicketRequest()}
        {mode === 'coupon' && renderCoupon()}
        {mode === 'deposit' && renderDeposit()}
        {mode === 'awaiting' && renderAwaiting()}
      </div>
    </BottomSheet>
  );
};
