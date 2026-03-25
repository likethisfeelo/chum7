import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { IoNotificationsOutline } from 'react-icons/io5';
import { HiDotsVertical } from 'react-icons/hi';
import toast from 'react-hot-toast';
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
  challengeStartAt?: string;
  recruitingEndAt?: string;
};

type LifecycleTab = 'recruiting' | 'active';

// KST 자정 기준 D-day 계산 (양수 = 앞으로 N일, 0 = D-Day, 음수 = N일 지남)
function calcDday(isoDate?: string): { label: string; daysLeft: number } | null {
  if (!isoDate) return null;
  const start = new Date(isoDate);
  if (Number.isNaN(start.getTime())) return null;
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayKst = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()));
  const startKst = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const diffDays = Math.round((startKst.getTime() - todayKst.getTime()) / (1000 * 60 * 60 * 24));
  const label = diffDays > 0 ? `D-${diffDays}` : diffDays === 0 ? 'D-Day' : `D+${Math.abs(diffDays)}`;
  return { label, daysLeft: diffDays };
}

function formatStartDate(isoDate?: string): string | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const LIFECYCLE_TABS: { value: LifecycleTab; label: string }[] = [
  { value: 'recruiting', label: '모집중' },
  { value: 'active', label: '진행중' },
];

// ─── Enhanced Hover Preview Panel ───────────────────────────────
const EnhancedPreviewPanel = ({
  challenge,
  boardData,
  isBoardLoading,
  categoryEmoji,
  onViewDetail,
}: {
  challenge: Challenge | null;
  boardData: any;
  isBoardLoading: boolean;
  categoryEmoji: string;
  onViewDetail: (id: string) => void;
}) => {
  if (!challenge) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <span className="text-5xl mb-3 opacity-20">🔍</span>
        <p className="text-sm text-gray-400 leading-relaxed">
          챌린지 카드에<br />마우스를 올려보세요
        </p>
      </div>
    );
  }

  const textBlocks: any[] = (boardData?.blocks || [])
    .filter((b: any) => b.type === 'text' && b.content)
    .slice(0, 4);

  const imageBlocks: any[] = (boardData?.blocks || [])
    .filter((b: any) => b.type === 'image' && b.url)
    .slice(0, 1);

  return (
    <motion.div
      key={challenge.challengeId}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Challenge identity */}
      <div>
        <span
          className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${SLUG_TO_COLOR[challenge.category] || 'bg-gray-100 text-gray-600'}`}
        >
          {SLUG_TO_LABEL[challenge.category] || challenge.category}
        </span>
        <div className="flex items-start gap-3 mt-2">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
            {challenge.badgeIcon || categoryEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-base leading-snug">
              {challenge.title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {challenge.description}
            </p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200">
          👥 {challenge.stats?.totalParticipants || 0}명 참여
        </span>
        <span className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200">
          ✅ 완료율 {challenge.stats?.completionRate || 0}%
        </span>
        {challenge.durationDays && (
          <span className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200">
            📅 {challenge.durationDays}일
          </span>
        )}
      </div>

      {/* Challenge board preview */}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          챌린지 보드
        </p>

        {isBoardLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${90 - i * 15}%` }} />
            ))}
          </div>
        ) : imageBlocks.length > 0 ? (
          <img
            src={imageBlocks[0].url}
            alt="board"
            className="w-full rounded-xl object-cover mb-2"
            style={{ maxHeight: 120 }}
          />
        ) : null}

        {textBlocks.length > 0 ? (
          <div className="space-y-1.5">
            {textBlocks.map((block, i) => (
              <p key={i} className="text-sm text-gray-700 leading-snug line-clamp-2">
                {block.content}
              </p>
            ))}
          </div>
        ) : !isBoardLoading ? (
          <p className="text-sm text-gray-400 italic">아직 보드 안내가 없어요.</p>
        ) : null}
      </div>

      <button
        onClick={() => onViewDetail(challenge.challengeId)}
        className="w-full bg-gray-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-700 transition-colors"
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
  lifecycle,
  categoryEmoji,
  onNavigate,
  onHover,
  onLeave,
  onInterest,
  isInterested,
}: {
  challenge: Challenge;
  index: number;
  lifecycle: 'recruiting' | 'active';
  categoryEmoji: string;
  onNavigate: (id: string) => void;
  onHover: (c: Challenge) => void;
  onLeave: () => void;
  onInterest: (id: string) => void;
  isInterested: boolean;
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
        {lifecycle === 'recruiting' && (() => {
          const dday = calcDday(challenge.challengeStartAt);
          const startLabel = formatStartDate(challenge.challengeStartAt);
          if (!dday || !startLabel) return null;
          return (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400">시작일 {startLabel}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                dday.daysLeft <= 3
                  ? 'bg-rose-50 text-rose-600'
                  : dday.daysLeft <= 7
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {dday.label}
              </span>
            </div>
          );
        })()}
      </div>
    </div>

    {/* Action button — desktop only */}
    <div className="hidden lg:flex justify-end mt-3 pt-3 border-t border-gray-50">
      {lifecycle === 'recruiting' ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(challenge.challengeId);
          }}
          className="text-sm font-semibold text-primary-600 hover:text-primary-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-primary-50"
        >
          참여하기 →
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInterest(challenge.challengeId);
          }}
          className={`text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            isInterested
              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
              : 'text-gray-600 hover:text-amber-700 hover:bg-amber-50'
          }`}
        >
          {isInterested ? '🔔 관심중' : '관심있어요 🔔'}
        </button>
      )}
    </div>
  </motion.div>
);

// ─── Lifecycle Section ───────────────────────────────────────────
const LifecycleSection = ({
  label,
  lifecycle,
  challenges,
  isLoading,
  categoryEmoji,
  interestedIds,
  onNavigate,
  onHover,
  onLeave,
  onInterest,
}: {
  label: string;
  lifecycle: 'recruiting' | 'active';
  challenges: Challenge[];
  isLoading: boolean;
  categoryEmoji: string;
  interestedIds: Set<string>;
  onNavigate: (id: string) => void;
  onHover: (c: Challenge) => void;
  onLeave: () => void;
  onInterest: (id: string) => void;
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
          lifecycle={lifecycle}
          categoryEmoji={categoryEmoji}
          onNavigate={onNavigate}
          onHover={onHover}
          onLeave={onLeave}
          onInterest={onInterest}
          isInterested={interestedIds.has(challenge.challengeId)}
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

  // Persist interest state in localStorage
  const [interestedIds, setInterestedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('challenge-interests');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set();
    }
  });

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

  // Hover preview: fetch board data for hovered challenge
  const { data: previewBoardData, isLoading: isBoardLoading } = useQuery({
    queryKey: ['challenge-preview-board', hoveredChallenge?.challengeId],
    enabled: Boolean(hoveredChallenge?.challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenge-board/${hoveredChallenge!.challengeId}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
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

  const handleInterest = useCallback(async (challengeId: string) => {
    const newSet = new Set(interestedIds);
    const wasInterested = newSet.has(challengeId);

    if (wasInterested) {
      newSet.delete(challengeId);
      toast('관심 챌린지에서 제거했어요.', { icon: '🔕' });
    } else {
      newSet.add(challengeId);
      toast.success('관심 챌린지로 등록됐어요! 새 소식을 알려드릴게요 🔔');
      // API call — gracefully fail if not implemented yet
      try {
        await apiClient.post(`/challenge-interest/${challengeId}`);
      } catch {
        // Backend endpoint not yet implemented — store locally
      }
    }

    setInterestedIds(newSet);
    try {
      localStorage.setItem('challenge-interests', JSON.stringify([...newSet]));
    } catch {
      // ignore
    }
  }, [interestedIds]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">챌린지 🎯</h1>
        <p className="text-sm text-gray-500 mt-0.5">7일간의 짧고 강렬한 도전</p>

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

      {/* ── Main layout: CSS Grid on lg ────────────────────────── */}
      {/*  Desktop:                                                 */}
      {/*  ┌──────────────────────────────────────────────────────┐ */}
      {/*  │  BANNER (col-span-2, full width)        [MAGENTA]   │ */}
      {/*  ├────────────────────────────┬─────────────────────────┤ */}
      {/*  │  Challenge lists (2-col)   │  Preview Panel [PURPLE] │ */}
      {/*  └────────────────────────────┴─────────────────────────┘ */}
      <div className="px-4 lg:grid lg:grid-cols-[1fr_288px] lg:gap-x-5">

        {/* ── Banner — spans both columns on desktop ─────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCategory.slug}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
            className="select-none mt-4 mb-4 lg:col-span-2"
          >
            <div className="rounded-2xl overflow-hidden shadow-sm relative">
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

              {/* Mobile navigation overlay */}
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

              {/* Content overlay — bottom of banner */}
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
          </motion.div>
        </AnimatePresence>

        {/* ── Challenge Lists — left column ──────────────────── */}
        <div className="pb-6">
          {/* Mobile: single tab */}
          <div className="lg:hidden">
            <div className="mb-2">
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
                    lifecycle={lifecycleTab}
                    categoryEmoji={currentCategory.emoji}
                    onNavigate={(id) => navigate(`/challenges/${id}`)}
                    onHover={handleHover}
                    onLeave={handleLeave}
                    onInterest={handleInterest}
                    isInterested={interestedIds.has(challenge.challengeId)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Desktop: 모집중 + 진행중 side by side */}
          <div className="hidden lg:grid lg:grid-cols-2 lg:gap-5">
            <LifecycleSection
              label="모집중"
              lifecycle="recruiting"
              challenges={recruitingChallenges}
              isLoading={recruitingLoading}
              categoryEmoji={currentCategory.emoji}
              interestedIds={interestedIds}
              onNavigate={(id) => navigate(`/challenges/${id}`)}
              onHover={handleHover}
              onLeave={handleLeave}
              onInterest={handleInterest}
            />
            <LifecycleSection
              label="진행중"
              lifecycle="active"
              challenges={activeChallenges}
              isLoading={activeLoading}
              categoryEmoji={currentCategory.emoji}
              interestedIds={interestedIds}
              onNavigate={(id) => navigate(`/challenges/${id}`)}
              onHover={handleHover}
              onLeave={handleLeave}
              onInterest={handleInterest}
            />
          </div>
        </div>

        {/* ── Preview Panel — right column (purple zone) ─────── */}
        <div
          className="hidden lg:block pb-6"
          onMouseEnter={handlePanelEnter}
          onMouseLeave={handleLeave}
        >
          <div className="sticky top-24 bg-white rounded-2xl p-5 shadow-sm border border-gray-100 min-h-[360px] overflow-y-auto max-h-[calc(100vh-7rem)]">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              챌린지 미리보기
            </div>
            <EnhancedPreviewPanel
              challenge={hoveredChallenge}
              boardData={previewBoardData}
              isBoardLoading={isBoardLoading}
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
