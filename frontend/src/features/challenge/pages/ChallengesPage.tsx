import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import {
  CHALLENGE_CATEGORIES,
  SLUG_TO_LABEL,
  SLUG_TO_COLOR,
  DEFAULT_BANNERS,
} from '../constants/categories';

type CategoryBanner = {
  slug: string;
  imageUrl?: string;
  tagline?: string;
  description?: string;
};

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
};

export const ChallengesPage = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const currentCategory = CHALLENGE_CATEGORIES[currentIndex];

  const { data: bannersData } = useQuery({
    queryKey: ['category-banners'],
    queryFn: async () => {
      const response = await apiClient.get('/category-banners');
      return response.data.data as CategoryBanner[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['challenges', currentCategory.slug],
    queryFn: async () => {
      const response = await apiClient.get(`/challenges?category=${currentCategory.slug}`);
      return response.data.data;
    },
  });

  const challenges = (data?.challenges || []).filter(
    (c: any) => String(c.lifecycle) === 'recruiting',
  );

  const activeBanner = bannersData?.find((b) => b.slug === currentCategory.slug);
  const fallback = DEFAULT_BANNERS[currentCategory.slug];
  const tagline = activeBanner?.tagline ?? fallback?.tagline ?? '';
  const description = activeBanner?.description ?? fallback?.description ?? '';

  const goTo = (index: number) => {
    if (index === currentIndex) return;
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  const handleDragEnd = (_: any, info: { offset: { x: number } }) => {
    if (info.offset.x < -50 && currentIndex < CHALLENGE_CATEGORIES.length - 1) {
      goTo(currentIndex + 1);
    } else if (info.offset.x > 50 && currentIndex > 0) {
      goTo(currentIndex - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">챌린지 🎯</h1>
        <p className="text-sm text-gray-500 mt-0.5">7일간의 짧고 강렬한 도전</p>
      </div>

      {/* Category Navigation */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between gap-3">
        <button
          onClick={() => goTo(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="text-gray-400 disabled:opacity-20 hover:text-gray-700 transition-colors text-xl font-light w-6 flex-shrink-0"
          aria-label="previous category"
        >
          ←
        </button>

        <div className="flex gap-1.5 flex-1 justify-center">
          {CHALLENGE_CATEGORIES.map((cat, i) => (
            <button
              key={cat.slug}
              onClick={() => goTo(i)}
              aria-label={cat.label}
              className={`rounded-full transition-all duration-200 ${
                i === currentIndex
                  ? 'w-6 h-2.5 bg-primary-500'
                  : 'w-2.5 h-2.5 bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => goTo(Math.min(CHALLENGE_CATEGORIES.length - 1, currentIndex + 1))}
          disabled={currentIndex === CHALLENGE_CATEGORIES.length - 1}
          className="text-gray-400 disabled:opacity-20 hover:text-gray-700 transition-colors text-xl font-light w-6 flex-shrink-0"
          aria-label="next category"
        >
          →
        </button>
      </div>

      {/* Swipeable Category Banner + Challenge List */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentCategory.slug}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'tween', duration: 0.25 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
          className="select-none"
        >
          {/* Hero Banner */}
          <div className="mx-4 mt-4 rounded-2xl overflow-hidden shadow-sm">
            {activeBanner?.imageUrl ? (
              <div className="relative">
                <img
                  src={activeBanner.imageUrl}
                  alt={currentCategory.label}
                  className="w-full h-52 object-cover"
                  draggable={false}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-0 left-0 p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-1">
                    {currentCategory.emoji} {currentCategory.label}
                  </p>
                  <h2 className="text-2xl font-bold leading-tight">{tagline}</h2>
                  {description && (
                    <p className="text-sm opacity-80 mt-1">{description}</p>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="w-full h-52 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-gray-100 to-gray-200"
              >
                <span className="text-5xl">{currentCategory.emoji}</span>
                <div className="text-center px-6">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
                    {currentCategory.label}
                  </p>
                  <h2 className="text-lg font-bold text-gray-800 leading-snug">{tagline}</h2>
                  {description && (
                    <p className="text-sm text-gray-500 mt-1">{description}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Category label pill */}
          <div className="px-4 mt-4 mb-2 flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full ${SLUG_TO_COLOR[currentCategory.slug] || 'bg-gray-100 text-gray-600'}`}
            >
              {currentCategory.label}
            </span>
            <span className="text-sm text-gray-400">모집 중인 챌린지</span>
          </div>

          {/* Challenge List */}
          <div className="px-4 pb-6 space-y-3">
            {isLoading ? (
              <Loading />
            ) : challenges.length === 0 ? (
              <EmptyState
                icon="🎯"
                title="모집 중인 챌린지가 없어요"
                description="다른 카테고리를 탐색해보세요"
              />
            ) : (
              challenges.map((challenge: any, index: number) => (
                <motion.div
                  key={challenge.challengeId}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => navigate(`/challenges/${challenge.challengeId}`)}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md active:scale-[0.99] transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
                      {challenge.badgeIcon || currentCategory.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-1.5 ${SLUG_TO_COLOR[challenge.category] || 'bg-gray-100 text-gray-600'}`}
                      >
                        {SLUG_TO_LABEL[challenge.category] || challenge.category}
                      </span>
                      <h3 className="font-bold text-gray-900 mb-1 line-clamp-2">{challenge.title}</h3>
                      <p className="text-sm text-gray-500 line-clamp-2">{challenge.description}</p>
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
