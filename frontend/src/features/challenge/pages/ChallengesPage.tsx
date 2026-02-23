import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';

const CATEGORIES = ['전체', '건강', '습관', '자기계발', '창의성', '관계', '마음챙김'];

const CATEGORY_COLORS: Record<string, string> = {
  건강: 'bg-red-100 text-red-600',
  습관: 'bg-teal-100 text-teal-600',
  자기계발: 'bg-blue-100 text-blue-600',
  창의성: 'bg-orange-100 text-orange-600',
  관계: 'bg-green-100 text-green-600',
  마음챙김: 'bg-purple-100 text-purple-600',
};

export const ChallengesPage = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState('전체');

  const { data, isLoading } = useQuery({
    queryKey: ['challenges', selectedCategory],
    queryFn: async () => {
      const params = selectedCategory !== '전체' ? `?category=${selectedCategory}` : '';
      const response = await apiClient.get(`/challenges${params}`);
      return response.data.data;
    },
  });

  const challenges = data?.challenges || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">챌린지 🎯</h1>
          <p className="text-sm text-gray-500 mt-0.5">7일간의 짧고 강렬한 도전</p>
        </div>

        {/* 카테고리 필터 */}
        <div className="flex gap-2 px-6 pb-3 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedCategory === category
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* 챌린지 목록 */}
      <div className="p-6 space-y-4">
        {isLoading ? (
          <Loading />
        ) : challenges.length === 0 ? (
          <EmptyState
            icon="🎯"
            title="챌린지가 없어요"
            description="다른 카테고리를 선택해보세요"
          />
        ) : (
          challenges.map((challenge: any, index: number) => (
            <motion.div
              key={challenge.challengeId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => navigate(`/challenges/${challenge.challengeId}`)}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
            >
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">
                  {challenge.badgeIcon || '🎯'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[challenge.category] || 'bg-gray-100 text-gray-600'}`}>
                      {challenge.category}
                    </span>
                    {!challenge.isActive && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        종료
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1 line-clamp-2">
                    {challenge.title}
                  </h3>
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {challenge.description}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>👥 {challenge.stats?.totalParticipants || 0}명 참여</span>
                    <span>✅ 완료율 {challenge.stats?.completionRate || 0}%</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
