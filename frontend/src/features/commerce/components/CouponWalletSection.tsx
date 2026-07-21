import { useQuery } from '@tanstack/react-query';
import { Loading } from '@/shared/components/Loading';
import { commerceApi, Coupon } from '../api/commerceApi';

const COUPON_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  active: { label: '사용 가능', badgeClass: 'bg-primary-100 text-primary-700' },
  redeemed: { label: '사용 완료', badgeClass: 'bg-gray-100 text-gray-500' },
  revoked: { label: '회수됨', badgeClass: 'bg-red-100 text-red-700' },
};

const formatDate = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export function CouponWalletSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-coupons'],
    queryFn: () => commerceApi.getMyCoupons(),
  });

  const coupons: Coupon[] = data?.coupons ?? [];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-500 mb-3">내 쿠폰함</h3>

      {isLoading ? (
        <Loading />
      ) : coupons.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">보유한 쿠폰이 없어요</p>
      ) : (
        <div className="space-y-2">
          {coupons.map((coupon) => {
            const meta = COUPON_STATUS_META[coupon.status] ?? {
              label: coupon.status,
              badgeClass: 'bg-gray-100 text-gray-500',
            };
            const expires = formatDate(coupon.expiresAt);
            return (
              <div
                key={coupon.code}
                className={`rounded-xl border p-3 flex items-center gap-3 ${
                  coupon.status === 'active' ? 'border-primary-100 bg-primary-50' : 'border-gray-100 bg-gray-50'
                }`}
              >
                <span className="text-xl">🎟️</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold font-mono text-gray-900 truncate">{coupon.code}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {coupon.challengeId === 'ANY' ? '모든 챌린지 사용 가능' : '지정 챌린지 전용'}
                    {expires ? ` · ~${expires}` : ''}
                  </p>
                  {coupon.memo && <p className="text-[11px] text-gray-400 truncate">{coupon.memo}</p>}
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.badgeClass}`}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
