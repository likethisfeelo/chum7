import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export const BadgeCollectionPage = () => {
  const navigate = useNavigate();

  const { data: badges, isLoading } = useQuery({
    queryKey: ['my-badges'],
    queryFn: async () => {
      const response = await apiClient.get('/user/challenges?status=completed');
      return response.data.data.challenges;
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
            {badges.map((badge: any, index: number) => (
              <motion.div
                key={badge.userChallengeId}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <div className="w-full aspect-square bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center mb-4">
                  <span className="text-5xl">{badge.challenge?.badgeIcon || '🏆'}</span>
                </div>
                <h3 className="font-bold text-gray-900 text-center mb-1 text-sm line-clamp-2">
                  {badge.challenge?.badgeName}
                </h3>
                <p className="text-xs text-gray-500 text-center">
                  {format(new Date(badge.startDate), 'yyyy.MM.dd', { locale: ko })} 완주
                </p>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-center text-primary-600 font-medium">
                    {badge.score}점
                  </p>
                </div>
              </motion.div>
            ))}
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
