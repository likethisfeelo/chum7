import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { SLUG_TO_COLOR, SLUG_TO_LABEL } from '../constants/categories';

// 챌린지 리스트 동그라미를 눌렀을 때 열리는 완주 보상 상품 페이지.
//  등록된 보상 상품(실물/기프티콘/온라인 서비스) + 받을 수 있는 조건 + 참여 버튼.
const REWARD_TYPE_META: Record<string, { label: string; emoji: string; badgeClass: string }> = {
  physical: { label: '실물 상품', emoji: '📦', badgeClass: 'bg-amber-100 text-amber-700' },
  gifticon: { label: '온라인 상품 (기프티콘)', emoji: '🎟️', badgeClass: 'bg-rose-100 text-rose-700' },
  service: { label: '온라인 상품 (서비스)', emoji: '💻', badgeClass: 'bg-sky-100 text-sky-700' },
};

type RewardProduct = {
  productId?: string;
  type?: 'physical' | 'gifticon' | 'service';
  name?: string;
  description?: string;
  imageUrl?: string;
};

export const RewardProductPage = () => {
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();

  const { data: challenge, isLoading } = useQuery<any>({
    queryKey: ['challenge-detail', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/public/challenges/${challengeId}`);
      return response.data.data;
    },
  });

  if (isLoading) return <Loading />;

  const products: RewardProduct[] = ((challenge?.rewardProducts ?? []) as RewardProduct[]).filter(
    (p) => p?.name,
  );
  const lifecycle: string = challenge?.lifecycle ?? '';
  const isRecruiting = lifecycle === 'recruiting';
  const isEnded = lifecycle === 'completed' || lifecycle === 'archived' || challenge?.disbanded === true;

  return (
    <div className="min-h-screen pb-28">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="뒤로"
          className="text-xl text-gray-600 hover:text-gray-900"
        >
          ←
        </button>
        <div className="min-w-0">
          <p className="text-xs text-gray-400">완주 보상</p>
          <h1 className="font-bold text-gray-900 truncate">{challenge?.title ?? '챌린지'}</h1>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-xl mx-auto space-y-4">
        {challenge && (
          <span
            className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${SLUG_TO_COLOR[challenge.category] || 'bg-gray-100 text-gray-600'}`}
          >
            {SLUG_TO_LABEL[challenge.category] || challenge.category}
          </span>
        )}

        {products.length === 0 ? (
          <EmptyState icon="🎁" title="등록된 보상 상품이 없어요" description="리더가 아직 완주 보상 상품을 등록하지 않았어요" />
        ) : (
          products.map((p, i) => {
            const meta = REWARD_TYPE_META[p.type ?? 'physical'] ?? REWARD_TYPE_META.physical;
            return (
              <motion.div
                key={p.productId ?? i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="glass-card rounded-2xl overflow-hidden"
              >
                {p.imageUrl ? (
                  <div className="aspect-square bg-gray-50">
                    <img
                      src={resolveMediaUrl(p.imageUrl)}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square bg-gradient-to-br from-amber-50 to-rose-50 flex items-center justify-center">
                    <span className="text-7xl">{meta.emoji}</span>
                  </div>
                )}
                <div className="p-4">
                  <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.badgeClass}`}>
                    {meta.emoji} {meta.label}
                  </span>
                  <h2 className="mt-1.5 font-bold text-gray-900 text-lg leading-snug">{p.name}</h2>
                  {p.description && (
                    <p className="mt-1 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{p.description}</p>
                  )}
                </div>
              </motion.div>
            );
          })
        )}

        {/* 받을 수 있는 조건 */}
        <div className="glass-card rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-900">받을 수 있는 조건</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
            <li className="flex items-start gap-2">
              <span>✅</span>
              <span>
                챌린지에 참여해{' '}
                {challenge?.durationDays ? <b>{challenge.durationDays}일</b> : '기간 내'} 인증을 완료(완주)해야
                해요.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span>🎟️</span>
              <span>완주하면 리더가 <b>선물 교환권</b>으로 보내드려요. 실물 상품은 교환 신청 시 배송 정보를 입력해요.</span>
            </li>
            {challenge?.badgeName && (
              <li className="flex items-start gap-2">
                <span>🏅</span>
                <span>
                  완주 배지 <b>{challenge.badgeName}</b>도 함께 받아요.
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* 하단 고정 참여 CTA */}
      <div className="fixed bottom-0 inset-x-0 z-20 p-4 bg-gradient-to-t from-white via-white to-transparent">
        <div className="max-w-xl mx-auto">
          <button
            type="button"
            onClick={() => navigate(`/challenges/${challengeId}`)}
            className="w-full py-4 rounded-2xl bg-gray-900 text-white font-bold text-base shadow-lg hover:bg-gray-700 transition-colors"
          >
            {isEnded
              ? '종료된 챌린지 · 자세히 보기'
              : isRecruiting
                ? '챌린지 참여하러 가기 →'
                : '챌린지 자세히 보기 →'}
          </button>
        </div>
      </div>
    </div>
  );
};
