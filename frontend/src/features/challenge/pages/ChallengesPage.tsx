import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { IoNotificationsOutline } from 'react-icons/io5';
import { HiDotsVertical } from 'react-icons/hi';
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
  enter: { opacity: 0, scale: 0.97 },
  center: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
};

type LifecycleTab = 'recruiting' | 'active';

const LIFECYCLE_TABS: { value: LifecycleTab; label: string }[] = [
  { value: 'recruiting', label: '모집중' },
  { value: 'active', label: '진행중' },
];

export const ChallengesPage = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lifecycleTab, setLifecycleTab] = useState<LifecycleTab>('recruiting');

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
    queryKey: ['challenges', currentCategory.slug, lifecycleTab],
    queryFn: async () => {
      const response = await apiClient.get(
        `/challenges?category=${currentCategory.slug}&lifecycle=${lifecycleTab}`,
      );
      return response.data.data;
    },
  });

  const challenges = data?.challenges || [];

  const activeBanner = bannersData?.find((b) => b.slug === currentCategory.slug);
  const fallback = DEFAULT_BANNERS[currentCategory.slug];
  const tagline = activeBanner?.tagline ?? fallback?.tagline ?? '';
  const description = activeBanner?.description ?? fallback?.description ?? '';

  const goTo = (index: number) => {
    if (index === currentIndex) return;
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
        <div className="flex gap-2 mt-3">
          {LIFECYCLE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setLifecycleTab(tab.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                lifecycleTab === tab.value
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Swipeable Category Banner + Challenge List */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentCategory.slug}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
          className="select-none"
        >
          {/* Hero Banner */}
          <div className="mx-4 mt-4 rounded-2xl overflow-hidden shadow-sm relative">
            {activeBanner?.imageUrl ? (
              <>
                <div className="aspect-square">
                  <img
                    src={activeBanner.imageUrl}
                    alt={currentCategory.label}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
              </>
            ) : (
              <div className="aspect-square bg-gradient-to-br from-gray-700 to-gray-500 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-6xl">{currentCategory.emoji}</span>
                </div>
              </div>
            )}

            {/* Navigation overlay — top of banner */}
            <div className="absolute top-0 left-0 right-0 px-4 pt-3 pb-2 flex items-center justify-between">
              <button
                onClick={() => goTo(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                className="text-white disabled:opacity-20 hover:text-white/80 transition-colors text-xl font-light w-6 flex-shrink-0"
                aria-label="previous category"
              >
                ←
              </button>

              <div className="flex flex-col items-center gap-1.5 flex-1">
                <span className="text-white font-semibold text-xs uppercase tracking-widest">
                  {currentCategory.label}
                </span>
                <div className="flex gap-1.5 justify-center">
                  {CHALLENGE_CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.slug}
                      onClick={() => goTo(i)}
                      aria-label={cat.label}
                      className={`rounded-full transition-all duration-200 ${
                        i === currentIndex
                          ? 'w-5 h-1.5 bg-white'
                          : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={() => goTo(Math.min(CHALLENGE_CATEGORIES.length - 1, currentIndex + 1))}
                disabled={currentIndex === CHALLENGE_CATEGORIES.length - 1}
                className="text-white disabled:opacity-20 hover:text-white/80 transition-colors text-xl font-light w-6 flex-shrink-0"
                aria-label="next category"
              >
                →
              </button>
            </div>

            {/* Content overlay — bottom of banner */}
            <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-white leading-tight">{tagline}</h2>
                {description && (
                  <p className="text-sm text-white/80 mt-1 line-clamp-2">{description}</p>
                )}
              </div>
              <div className="flex flex-col gap-3 items-center flex-shrink-0 pb-0.5">
                <button
                  aria-label="알림"
                  className="text-white/90 hover:text-white transition-colors"
                >
                  <IoNotificationsOutline size={22} />
                </button>
                <button
                  aria-label="더보기"
                  className="text-white/90 hover:text-white transition-colors"
                >
                  <HiDotsVertical size={22} />
                </button>
              </div>
            </div>
          </div>

          {/* Section label */}
          <div className="px-4 mt-4 mb-2">
            <span className="text-sm text-gray-400">
              {lifecycleTab === 'recruiting' ? '모집 중인 챌린지' : '진행 중인 챌린지'}
            </span>
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
      {/* 챌린지 만들기 FAB */}
      <button
        onClick={() => navigate('/challenges/new')}
        className="fixed bottom-24 right-4 w-13 h-13 bg-primary-500 text-white rounded-full shadow-lg flex items-center justify-center z-20 hover:bg-primary-600 active:scale-95 transition-all"
        style={{ width: 52, height: 52 }}
        aria-label="챌린지 만들기"
      >
        <span className="text-2xl leading-none">+</span>
      </button>
    </div>
  );
};
