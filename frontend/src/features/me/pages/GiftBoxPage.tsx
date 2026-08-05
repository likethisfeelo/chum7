import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { commerceApi, Voucher } from '@/features/commerce/api/commerceApi';
import { Loading } from '@/shared/components/Loading';

/**
 * 완주 선물 교환권함 — 리더가 보낸 교환권 확인·교환 신청·수령 확인.
 * 실물(physical) 교환 신청 시 수령인 이름/전화/주소를 입력해 배송받는다.
 */

const STATUS_META: Record<Voucher['status'], { label: string; cls: string }> = {
  issued: { label: '교환 가능', cls: 'bg-emerald-100 text-emerald-700' },
  claimed: { label: '교환 신청됨', cls: 'bg-amber-100 text-amber-700' },
  shipped: { label: '배송중', cls: 'bg-blue-100 text-blue-700' },
  delivered: { label: '수령 완료', cls: 'bg-gray-200 text-gray-600' },
  expired: { label: '만료됨', cls: 'bg-gray-100 text-gray-400' },
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
  } catch {
    return iso;
  }
};

const daysLeft = (expiresAt: string): number =>
  Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);

export const GiftBoxPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [claiming, setClaiming] = useState<Voucher | null>(null);
  const [recipient, setRecipient] = useState({ name: '', phone: '', address: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['my-vouchers'],
    queryFn: () => commerceApi.getMyVouchers(),
  });
  const vouchers = data?.vouchers ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-vouchers'] });

  const claimMutation = useMutation({
    mutationFn: (vars: { voucher: Voucher; recipient?: { name: string; phone: string; address: string } }) =>
      commerceApi.claimVoucher(vars.voucher.voucherId, vars.recipient),
    onSuccess: (res) => {
      toast.success(res?.message || '교환 신청 완료!');
      setClaiming(null);
      setRecipient({ name: '', phone: '', address: '' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '교환 신청에 실패했어요'),
  });

  const receiptMutation = useMutation({
    mutationFn: (voucherId: string) => commerceApi.confirmVoucherReceipt(voucherId),
    onSuccess: (res) => {
      toast.success(res?.message || '수령을 확인했어요 🎉');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '처리에 실패했어요'),
  });

  const startClaim = (v: Voucher) => {
    if (v.type === 'digital') {
      if (window.confirm(`'${v.giftName}' 교환권을 사용할까요?`)) {
        claimMutation.mutate({ voucher: v });
      }
      return;
    }
    setClaiming(v);
  };

  const canSubmitRecipient =
    recipient.name.trim().length > 0 && recipient.phone.trim().length >= 8 && recipient.address.trim().length >= 5;

  return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 glass-header px-6 py-4 flex items-center gap-4 z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold">🎁 선물 교환권함</h1>
          <p className="text-sm text-gray-500">완주 선물 교환권 {vouchers.length}장</p>
        </div>
      </div>

      <div className="p-4 mx-auto w-full max-w-2xl space-y-3">
        {isLoading ? (
          <Loading />
        ) : vouchers.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 border border-dashed border-gray-200 p-10 text-center">
            <p className="text-3xl mb-2">🎁</p>
            <p className="text-sm font-semibold text-gray-700">아직 받은 교환권이 없어요</p>
            <p className="text-xs text-gray-400 mt-1">챌린지를 완주하면 리더가 보내는 선물을 받을 수 있어요</p>
          </div>
        ) : (
          vouchers.map((v) => {
            const meta = STATUS_META[v.status] ?? STATUS_META.issued;
            const remain = v.status === 'issued' ? daysLeft(v.expiresAt) : null;
            return (
              <div key={v.voucherId} className="glass-card rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{v.type === 'physical' ? '📦' : '🎁'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{v.giftName}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                      {v.type === 'physical' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">실물 배송</span>
                      )}
                    </div>
                    {v.challengeTitle && <p className="text-xs text-gray-500 mt-0.5">{v.challengeTitle}</p>}
                    {v.giftDescription && (
                      <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{v.giftDescription}</p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1">
                      {v.status === 'issued'
                        ? `유효기간 ${fmtDate(v.expiresAt)}까지${remain !== null ? ` (${Math.max(0, remain)}일 남음)` : ''}`
                        : v.status === 'shipped'
                          ? `발송일 ${fmtDate(v.shippedAt)}${v.trackingInfo ? ` · ${v.trackingInfo}` : ''}`
                          : v.status === 'delivered'
                            ? `수령일 ${fmtDate(v.deliveredAt)}`
                            : `신청일 ${fmtDate(v.claimedAt)}`}
                    </p>
                  </div>
                </div>

                {v.status === 'issued' && (
                  <button
                    type="button"
                    onClick={() => startClaim(v)}
                    disabled={claimMutation.isPending}
                    className="mt-3 w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {v.type === 'physical' ? '교환 신청 (배송지 입력) 📦' : '교환권 사용하기 🎁'}
                  </button>
                )}
                {v.status === 'claimed' && v.type === 'physical' && (
                  <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    리더가 발송을 준비 중이에요. 발송되면 알림으로 알려드릴게요.
                  </p>
                )}
                {v.status === 'shipped' && (
                  <button
                    type="button"
                    onClick={() => receiptMutation.mutate(v.voucherId)}
                    disabled={receiptMutation.isPending}
                    className="mt-3 w-full py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-semibold disabled:opacity-50"
                  >
                    받았어요! 수령 확인 ✅
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 실물 교환 신청 — 수령인 정보 입력 모달 */}
      {claiming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setClaiming(null)}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900">📦 배송지 입력</h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              '{claiming.giftName}' 실물 수령을 위해 배송 정보를 입력해주세요. 정보는 발송하는 리더에게만 전달돼요.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">수령인 이름</label>
                <input
                  value={recipient.name}
                  onChange={(e) => setRecipient((r) => ({ ...r, name: e.target.value }))}
                  maxLength={50}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm"
                  placeholder="이름"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">전화번호</label>
                <input
                  value={recipient.phone}
                  onChange={(e) => setRecipient((r) => ({ ...r, phone: e.target.value }))}
                  maxLength={20}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm"
                  placeholder="010-0000-0000"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">주소</label>
                <textarea
                  value={recipient.address}
                  onChange={(e) => setRecipient((r) => ({ ...r, address: e.target.value }))}
                  rows={2}
                  maxLength={300}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm resize-none"
                  placeholder="배송받을 주소 (상세주소 포함)"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setClaiming(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="button"
                disabled={!canSubmitRecipient || claimMutation.isPending}
                onClick={() =>
                  claimMutation.mutate({
                    voucher: claiming,
                    recipient: {
                      name: recipient.name.trim(),
                      phone: recipient.phone.trim(),
                      address: recipient.address.trim(),
                    },
                  })
                }
                className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {claimMutation.isPending ? '신청 중...' : '교환 신청'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
