import { useCallback, useRef, useState } from 'react';
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

type Challenge = {
  challengeId: string;
  title: string;
  description: string;
  category: string;
  badgeIcon?: string;
  stats?: {
    totalParticipants?: number;
    completionRate?: number;
  };
  durationDays?: number;
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

// ─── Hover Preview Panel ────────────────────────────────────────
const HoverPreviewPanel = ({
  challenge,
  categoryEmoji,
  onViewDetail,
}: {
  challenge: Challenge | null;
  categoryEmoji: string;
  onViewDetail: (id: string) => void;
}) => {
  if (!challenge) {
    return (
      <div className="hidden lg:flex flex-col items-center justify-center h-64 text-center">
        <span className="text-4xl mb-3 opacity-30">🔍</span>
        <p className="text-sm text-gray-400">챌린지 카드에 마우스를<br />올려보세요</p>
      </div>
    );
  }

  return (
    <motion.div
      key={challenge.challengeId}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="hidden lg:block"
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${SLUG_TO_COLOR[challenge.category] || 'bg-gray-100 text-gray-600'}`}
        >
          {SLUG_TO_LABEL[challenge.category] || challenge.category}
        </span>
      </div>

      <div className="w-14 h-14 bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center text-3xl mb-3">
        {challenge.badgeIcon || categoryEmoji}
      </div>

      <h3 className="font-bold text-gray-900 text-lg leading-snug mb-2">
        {challenge.title}
      </h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">
        {challenge.description}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs bg-gray-50 text-gray-600 px-3 py-1.5 rounded-full border border-gray-200">
          👥 {challenge.stats?.totalParticipants || 0}명 참여
        </span>
        <span className="text-xs bg-gray-50 text-gray-600 px-3 py-1.5 rounded-full border border-gray-200">
          ✅ 완료율 {challenge.stats?.completionRate || 0}%
        </span>
        {challenge.durationDays && (
          <span className="text-xs bg-gray-50 text-gray-600 px-3 py-1.5 rounded-full border border-gray-200">
            📅 {challenge.durationDays}일
          </span>
        )}
      </div>

      <button
        onClick={() => onViewDetail(challenge.challengeId)}
        className="w-full bg-gray-900 text-white text-sm font-semibold py-3 rounded-xl hover:bg-gray-700 transition-colors"
      >
        자세히 보기 →
      </button>
    </motion.div>
  );
};

// ─── Challenge Card ─────────────────────────────────────────────
const ChallengeCard = ({
  challenge,
  index,
  categoryEmoji,
  onNavigate,
  onHover,
  onLeave,
}: {
  challenge: Challenge;
  index: number;
  categoryEmoji: string;
  onNavigate: (id: string) => void;
  onHover: (c: Challenge) => void;
  onLeave: () => void;
}) => (
  <motion.div
    key={challenge.challengeId}
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05 }}
    onClick={() => onNavigate(challenge.challengeId)}
    onMouseEnter={() => onHover(challenge)}
    onMouseLeave={onLeave}
    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-gray-200 active:scale-[0.99] transition-all"
  >
    <div className="flex items-start gap-4">
      <div className="w-14 h-14 bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
        {challenge.badgeIcon || categoryEmoji}
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
          <span>👥 {challenge.stats?.totalParticipants || 0}명</span>
          <span>✅ {challenge.stats?.completionRate || 0}%</span>
        </div>
      </div>
    </div>

    {/* 참여하기 버튼 — desktop only */}
    <div className="hidden lg:flex justify-end mt-3 pt-3 border-t border-gray-50">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(challenge.challengeId);
        }}
        className="text-sm font-semibold text-primary-600 hover:text-primary-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-primary-50"
      >
        참여하기 →
      </button>
    </div>
  </motion.div>
);

// ─── Column section (recruiting or active) ──────────────────────
const LifecycleSection = ({
  label,
  challenges,
  isLoading,
  categoryEmoji,
  onNavigate,
  onHover,
  onLeave,
}: {
  label: string;
  challenges: Challenge[];
  isLoading: boolean;
  categoryEmoji: string;
  onNavigate: (id: string) => void;
  onHover: (c: Challenge) => void;
  onLeave: () => void;
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      {!isLoading && (
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
          {challenges.length}개
        </span>
      )}
    </div>
    {isLoading ? (
      <Loading />
    ) : challenges.length === 0 ? (
      <EmptyState
        icon="🎯"
        title={`${label} 챌린지가 없어요`}
        description="다른 카테고리를 탐색해보세요"
      />
    ) : (
      challenges.map((challenge, index) => (
        <ChallengeCard
          key={challenge.challengeId}
          challenge={challenge}
          index={index}
          categoryEmoji={categoryEmoji}
          onNavigate={onNavigate}
          onHover={onHover}
          onLeave={onLeave}
        />
      ))
    )}
  </div>
);

// ─── Main Page ───────────────────────────────────────────────────
export const ChallengesPage = () => {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lifecycleTab, setLifecycleTab] = useState<LifecycleTab>('recruiting');
  const [hoveredChallenge, setHoveredChallenge] = useState<Challenge | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentCategory = CHALLENGE_CATEGORIES[currentIndex];

  const { data: bannersData } = useQuery({
    queryKey: ['category-banners'],
    queryFn: async () => {
      const response = await apiClient.get('/category-banners');
      return response.data.data as CategoryBanner[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Mobile: single lifecycle query
  const { data: mobileData, isLoading: mobileLoading } = useQuery({
    queryKey: ['challenges-mobile', currentCategory.slug, lifecycleTab],
    queryFn: async () => {
      const response = await apiClient.get(
        `/challenges?category=${currentCategory.slug}&lifecycle=${lifecycleTab}`,
      );
      return response.data.data;
    },
  });

  // Desktop: dual lifecycle queries
  const { data: recruitingData, isLoading: recruitingLoading } = useQuery({
    queryKey: ['challenges-recruiting', currentCategory.slug],
    queryFn: async () => {
      const response = await apiClient.get(
        `/challenges?category=${currentCategory.slug}&lifecycle=recruiting`,
      );
      return response.data.data;
    },
  });

  const { data: activeData, isLoading: activeLoading } = useQuery({
    queryKey: ['challenges-active', currentCategory.slug],
    queryFn: async () => {
      const response = await apiClient.get(
        `/challenges?category=${currentCategory.slug}&lifecycle=active`,
      );
      return response.data.data;
    },
  });

  const mobileChallenges: Challenge[] = mobileData?.challenges || [];
  const recruitingChallenges: Challenge[] = recruitingData?.challenges || [];
  const activeChallenges: Challenge[] = activeData?.challenges || [];

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

  const handleHover = useCallback((challenge: Challenge) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredChallenge(challenge);
  }, []);

  const handleLeave = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredChallenge(null);
    }, 200);
  }, []);

  const handlePanelEnter = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-6 py-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">챌린지 🎯</h1>
            <p className="text-sm text-gray-500 mt-0.5">7일간의 짧고 강렬한 도전</p>
          </div>
        </div>

        {/* Mobile: lifecycle tabs */}
        <div className="flex gap-2 mt-3 lg:hidden">
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

        {/* Desktop: category pill tabs */}
        <div className="hidden lg:flex gap-2 mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {CHALLENGE_CATEGORIES.map((cat, i) => (
            <button
              key={cat.slug}
              onClick={() => goTo(i)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                i === currentIndex
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Content (desktop: 2-col main + preview sidebar) ────── */}
      <div className="lg:flex lg:gap-0">
        {/* ── Main column ──────────────────────────────────────── */}
        <div className="lg:flex-1 lg:min-w-0">
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
              {/* ── Hero Banner ───────────────────────────────── */}
              <div className="mx-4 mt-4 rounded-2xl overflow-hidden shadow-sm relative">
                {activeBanner?.imageUrl ? (
                  <>
                    <div className="aspect-square md:aspect-[3/1] lg:aspect-[21/9]">
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
                  <div className="aspect-square md:aspect-[3/1] lg:aspect-[21/9] bg-gradient-to-br from-gray-700 to-gray-500 relative">
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-6xl lg:text-8xl">{currentCategory.emoji}</span>
                    </div>
                  </div>
                )}

                {/* Navigation overlay — mobile only */}
                <div className="absolute top-0 left-0 right-0 px-4 pt-3 pb-2 flex items-center justify-between lg:hidden">
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

                {/* Content overlay — bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-10 flex items-end justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl lg:text-4xl font-bold lg:font-extrabold text-white leading-tight">
                      {tagline}
                    </h2>
                    {description && (
                      <p className="text-sm lg:text-base text-white/80 mt-1 line-clamp-2 lg:line-clamp-none lg:mt-2">
                        {description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 items-center flex-shrink-0 pb-0.5">
                    <button aria-label="알림" className="text-white/90 hover:text-white transition-colors">
                      <IoNotificationsOutline size={22} />
                    </button>
                    <button aria-label="더보기" className="text-white/90 hover:text-white transition-colors">
                      <HiDotsVertical size={22} />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Challenge List ────────────────────────────── */}

              {/* Mobile: single tab */}
              <div className="lg:hidden px-4 pb-6">
                <div className="mt-4 mb-2">
                  <span className="text-sm text-gray-400">
                    {lifecycleTab === 'recruiting' ? '모집 중인 챌린지' : '진행 중인 챌린지'}
                  </span>
                </div>
                <div className="space-y-3 md:grid md:grid-cols-2 md:space-y-0 md:gap-3">
                  {mobileLoading ? (
                    <Loading />
                  ) : mobileChallenges.length === 0 ? (
                    <EmptyState
                      icon="🎯"
                      title="챌린지가 없어요"
                      description="다른 카테고리를 탐색해보세요"
                    />
                  ) : (
                    mobileChallenges.map((challenge, index) => (
                      <ChallengeCard
                        key={challenge.challengeId}
                        challenge={challenge}
                        index={index}
                        categoryEmoji={currentCategory.emoji}
                        onNavigate={(id) => navigate(`/challenges/${id}`)}
                        onHover={handleHover}
                        onLeave={handleLeave}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Desktop: dual columns (recruiting + active side by side) */}
              <div className="hidden lg:grid lg:grid-cols-2 lg:gap-5 px-4 mt-5 pb-6">
                <LifecycleSection
                  label="모집중"
                  challenges={recruitingChallenges}
                  isLoading={recruitingLoading}
                  categoryEmoji={currentCategory.emoji}
                  onNavigate={(id) => navigate(`/challenges/${id}`)}
                  onHover={handleHover}
                  onLeave={handleLeave}
                />
                <LifecycleSection
                  label="진행중"
                  challenges={activeChallenges}
                  isLoading={activeLoading}
                  categoryEmoji={currentCategory.emoji}
                  onNavigate={(id) => navigate(`/challenges/${id}`)}
                  onHover={handleHover}
                  onLeave={handleLeave}
                />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Preview Sidebar (desktop only) ───────────────────── */}
        <div
          className="hidden lg:block w-72 flex-shrink-0 px-4 pt-4"
          onMouseEnter={handlePanelEnter}
          onMouseLeave={handleLeave}
        >
          <div className="sticky top-24 bg-white rounded-2xl p-5 shadow-sm border border-gray-100 min-h-[320px]">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              챌린지 미리보기
            </div>
            <HoverPreviewPanel
              challenge={hoveredChallenge}
              categoryEmoji={currentCategory.emoji}
              onViewDetail={(id) => navigate(`/challenges/${id}`)}
            />
          </div>
        </div>
      </div>

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
