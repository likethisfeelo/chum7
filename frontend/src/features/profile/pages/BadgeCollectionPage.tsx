import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

type UserBadge = {
  badgeId: string;
  grantedAt: string;
  challengeId?: string | null;
  verificationId?: string | null;
  sourceDay?: number | null;
  sourceConsecutiveDays?: number | null;
};

const BADGE_META: Record<string, { icon: string; name: string; description: string }> = {
  '3-day-streak': {
    icon: '🔥',
    name: '3일 연속 달성',
    description: '3일 연속 인증을 달성했어요',
  },
  '7-day-master': {
    icon: '🏆',
    name: '7일 완주 마스터',
    description: '7일 챌린지를 완주했어요',
  },
};

const fallbackMeta = (badgeId: string) => ({
  icon: '🏅',
  name: badgeId,
  description: '획득한 뱃지',
});

export const BadgeCollectionPage = () => {
  const navigate = useNavigate();

  const { data: badges, isLoading } = useQuery<UserBadge[]>({
    queryKey: ['my-badges'],
    queryFn: async () => {
      const response = await apiClient.get('/users/me/badges');
      return response.data?.data?.badges ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold">뱃지 컬렉션</h1>
          <p className="text-sm text-gray-500">
            {badges?.length || 0}개의 뱃지를 모았어요
          </p>
        </div>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : badges && badges.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {badges.map((badge, index) => {
              const meta = BADGE_META[badge.badgeId] || fallbackMeta(badge.badgeId);

              return (
                <motion.div
                  key={`${badge.badgeId}-${badge.grantedAt}-${index}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.06 }}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
                >
                  <div className="w-full aspect-square bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center mb-4">
                    <span className="text-5xl">{meta.icon}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-center mb-1 text-sm line-clamp-2">
                    {meta.name}
                  </h3>
                  <p className="text-xs text-gray-500 text-center line-clamp-2">{meta.description}</p>
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-center text-primary-600 font-medium">
                      {format(new Date(badge.grantedAt), 'yyyy.MM.dd', { locale: ko })} 획득
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="🏆"
            title="아직 뱃지가 없어요"
            description="챌린지를 완주하고 첫 뱃지를 획득하세요!"
            action={{
              label: '챌린지 시작하기',
              onClick: () => navigate('/challenges'),
            }}
          />
        )}
      </div>
    </div>
  );
};
