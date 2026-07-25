import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';

import { CHALLENGE_CATEGORIES, SLUG_TO_COLOR, SLUG_TO_LABEL } from '@/features/challenge/constants/categories';

// 마당 헤더에 노출할 카테고리 — 목업 기준 5개(Selflove/Attitude/Discipline/Create/Impact)
const FEED_CATEGORY_SLUGS = ['health', 'mindfulness', 'habit', 'development', 'impact'] as const;
const FEED_CATEGORIES = FEED_CATEGORY_SLUGS
  .map((slug) => CHALLENGE_CATEGORIES.find((c) => c.slug === slug))
  .filter((c): c is (typeof CHALLENGE_CATEGORIES)[number] => Boolean(c));
import { EmptyState } from '@/shared/components/EmptyState';
import { SkeletonList } from '@/shared/components/Skeleton';

import { PlazaPostCard } from '@/features/feed/components/PlazaPostCard';
import { usePlazaFeed } from '@/features/feed/hooks/usePlazaFeed';
import { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import { usePlazaReactions } from '@/features/feed/hooks/usePlazaReactions';
import { personalFeedApi } from '@/features/personal-feed/api/personalFeedApi';
import { apiClient } from '@/lib/api-client';
import { hashtagApi } from '@/features/hashtag/api/hashtagApi';
import type { HashtagSummary } from '@/features/hashtag/api/hashtagApi';

// ── 모집 중인 챌린지 캐러셀 ────────────────────────────────────────────
function RecruitingChallengeBanner({
  challenges,
  onNavigate,
}: {
  challenges: any[];
  onNavigate: (id: string) => void;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (challenges.length <= 1) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % challenges.length), 4500);
    return () => clearInterval(timer);
  }, [challenges.length]);

  const ch = challenges[idx];
  if (!ch) return null;

  return (
    <section className="rounded-2xl overflow-hidden glass-panel">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">🌟 모집 중인 챌린지</h3>
          <span className="text-[11px] text-gray-400 tabular-nums">
            {idx + 1} / {challenges.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onNavigate(ch.challengeId)}
          className="w-full text-left rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 p-3.5 hover:from-indigo-100 hover:to-purple-100 transition-colors"
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl flex-shrink-0 leading-none mt-0.5">{ch.badgeIcon || '🎯'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{ch.title}</p>
              <p className="text-xs text-gray-500 mt-1">
                {ch.durationDays ? `${ch.durationDays}일 · ` : ''}
                👥 {ch.stats?.totalParticipants || 0}명 참여 중
              </p>
              <span className="inline-flex items-center gap-1 mt-2.5 px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg">
                참여하기 →
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* 도트 네비게이터 */}
      {challenges.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-3">
          {challenges.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`rounded-full transition-all duration-300 ${
                i === idx ? 'w-4 h-1.5 bg-indigo-500' : 'w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── 해쉬태그 사이드바 섹션 ────────────────────────────────────────────
function HashtagPanel({
  latestTags,
  onUserTagClick,
}: {
  latestTags: HashtagSummary[];
  onUserTagClick: (tag: string) => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? latestTags.filter((t) => t.hashtag.toLowerCase().includes(search.toLowerCase()))
    : latestTags;

  return (
    <section className="rounded-2xl p-4 glass-panel">
      <h3 className="text-sm font-bold text-gray-900 mb-3"># 해쉬태그</h3>

      {/* 검색 */}
      <div className="relative mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="해쉬태그 검색..."
          className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:border-indigo-300 focus:bg-white transition-colors"
        />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
      </div>

      {/* 최신 유저 해쉬태그 */}
      {filtered.length > 0 ? (
        <div className="space-y-0.5">
          <p className="text-[11px] text-gray-500 font-medium mb-1.5">최근 등록된 태그</p>
          {filtered.map((item) => (
            <button
              key={item.hashtag}
              type="button"
              onClick={() => onUserTagClick(item.hashtag)}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs text-left text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              {item.creatorAnimalIcon && (
                <span className="text-sm leading-none">{item.creatorAnimalIcon}</span>
              )}
              <span className="font-medium">#{item.hashtag}</span>
              {item.postCount > 0 && (
                <span className="ml-auto text-[10px] text-gray-400">{item.postCount}개</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 py-2 text-center">
          {search ? '검색 결과가 없어요' : '등록된 태그가 없어요'}
        </p>
      )}
    </section>
  );
}

// ── FeedPage ─────────────────────────────────────────────────────────────
export const FeedPage = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);
  // 카테고리 행 펼침 여부 — 기본 접힘(전체), CATEGORY 토글로 펼침
  const [categoryOpen, setCategoryOpen] = useState(false);

  // 최신 유저 해쉬태그 (사이드바 표시용)
  const { data: latestTags = [] } = useQuery({
    queryKey: ['hashtag-latest'],
    queryFn: () => hashtagApi.getLatest(7),
    staleTime: 2 * 60 * 1000,
  });

  // 모집 중인 챌린지
  const { data: recruitingChallenges = [] } = useQuery({
    queryKey: ['feed-recruiting-challenges'],
    queryFn: async () => {
      const response = await apiClient.get('/public/challenges?lifecycle=recruiting&limit=8');
      return response.data.data?.challenges || [];
    },
    staleTime: 3 * 60 * 1000,
  });

  // 저장된 게시물 ID 세트 (북마크 초기 상태용 — 단일 API 호출)
  const { data: savedPostsData } = useQuery({
    queryKey: ['personal-feed-saved-posts'],
    queryFn: () => personalFeedApi.getSavedPosts(),
    staleTime: 5 * 60 * 1000,
  });
  const savedPostIds = useMemo(
    () => new Set(savedPostsData?.savedPosts?.map((s) => s.plazaPostId) ?? []),
    [savedPostsData],
  );

  const { posts, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = usePlazaFeed(
    'all',
    selectedCategory ?? undefined,
    selectedHashtag ?? undefined,
  );

  const handleCategorySelect = (slug: string) => {
    setSelectedHashtag(null);
    setSelectedCategory((prev) => (prev === slug ? null : slug));
  };

  const handleUserHashtagClick = (hashtag: string) => {
    setSelectedCategory(null);
    setSelectedHashtag((prev) => (prev === hashtag ? null : hashtag));
  };

  const initialCommentCounts = useMemo(
    () => Object.fromEntries(posts.map((p) => [p.plazaPostId, Number(p.commentCount ?? 0)])),
    [posts],
  );
  const commentHook = usePlazaComments(initialCommentCounts);
  const reactions = usePlazaReactions();

  useEffect(() => {
    posts.forEach((post) => {
      reactions.initCount(post.plazaPostId, Number(post.likeCount ?? 0));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  const activeCat = selectedCategory
    ? CHALLENGE_CATEGORIES.find((c) => c.slug === selectedCategory)
    : null;

  return (
    <div className="min-h-screen">

      {/* ── Sticky Header ── */}
      <div
        className="sticky top-0 z-10"
        style={{
          background: 'rgba(255,255,255,0.78)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
        }}
      >
        <div className="px-6 pt-5 pb-3">
          {/* 타이틀 + CATEGORY 토글 */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-gray-800 leading-none">MADANG</h1>
              <p className="text-sm text-gray-500 mt-2">광장 피드 반익명 커뮤니티</p>
            </div>
            <button
              type="button"
              onClick={() => setCategoryOpen((o) => !o)}
              aria-expanded={categoryOpen}
              className="flex items-center gap-1 mt-1 text-sm font-semibold tracking-wide text-gray-600 hover:text-gray-900 transition-colors flex-shrink-0"
            >
              CATEGORY
              {/* 접힘 시 위(▲), 펼침 시 아래(▼) — 아래 화살표를 접힘 상태에서 180° 회전 */}
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${categoryOpen ? '' : 'rotate-180'}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {/* 카테고리 행 — CATEGORY 토글로 펼침/접힘 (기본 접힘 = 전체) */}
          <AnimatePresence initial={false}>
            {categoryOpen && (
              <motion.div
                key="category-row"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 flex items-center gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  <button
                    type="button"
                    onClick={() => { setSelectedCategory(null); setSelectedHashtag(null); }}
                    className={`flex-shrink-0 text-sm whitespace-nowrap pb-1 border-b-2 transition-colors ${
                      !selectedCategory
                        ? 'text-gray-900 font-semibold border-gray-800'
                        : 'text-gray-500 border-transparent hover:text-gray-700'
                    }`}
                  >
                    Show All
                  </button>
                  {FEED_CATEGORIES.map((cat) => (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => handleCategorySelect(cat.slug)}
                      className={`flex-shrink-0 text-sm whitespace-nowrap pb-1 border-b-2 transition-colors ${
                        selectedCategory === cat.slug
                          ? 'text-gray-900 font-semibold border-gray-800'
                          : 'text-gray-500 border-transparent hover:text-gray-700'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── 2-column layout ── */}
      <div className="px-4 lg:px-6 py-5 max-w-6xl mx-auto lg:grid lg:grid-cols-[1fr_288px] lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

        {/* ── Main Feed ── */}
        <div className="space-y-4">

          {/* 활성 해쉬태그 필터 표시 */}
          {(activeCat || selectedHashtag) && (
            <div className="flex items-center gap-2 px-1">
              {activeCat && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SLUG_TO_COLOR[activeCat.slug] || 'bg-gray-100 text-gray-600'}`}>
                  {activeCat.emoji} #{SLUG_TO_LABEL[activeCat.slug] || activeCat.label}
                </span>
              )}
              {selectedHashtag && (
                <button
                  type="button"
                  onClick={() => navigate(`/hashtag/${encodeURIComponent(selectedHashtag)}`)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                >
                  #{selectedHashtag} →
                </button>
              )}
              <span className="text-xs text-gray-400">해쉬태그 필터 중</span>
              <button
                type="button"
                onClick={() => { setSelectedCategory(null); setSelectedHashtag(null); }}
                className="ml-auto text-xs text-gray-400 hover:text-gray-700 flex items-center gap-0.5"
              >
                ✕ 해제
              </button>
            </div>
          )}

          {/* 게시물 목록 — 마소너리 (lg: 2-column CSS columns) */}
          <div>
            {isLoading ? (
              <SkeletonList count={3} />
            ) : isError ? (
              <EmptyState icon="⚠️" title="광장 피드를 불러오지 못했어요" description="잠시 후 다시 시도해주세요." />
            ) : posts.length === 0 ? (
              <EmptyState
                icon="🌌"
                title={selectedCategory ? '해당 해쉬태그 게시물이 없어요' : '아직 게시물이 없어요'}
                description={selectedCategory ? '다른 해쉬태그를 탐색해보세요' : '곧 마당 게시물이 여기에 표시됩니다.'}
              />
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <div key={post.plazaPostId}>
                    <PlazaPostCard
                      post={post}
                      likeCount={reactions.countMap[post.plazaPostId] ?? Number(post.likeCount ?? 0)}
                      isReacting={Boolean(reactions.reactingIds[post.plazaPostId])}
                      commentHook={commentHook}
                      recommendations={reactions.recommendationsByPost[post.plazaPostId] ?? []}
                      onReact={() => { void reactions.react(post); }}
                      onDismissRecommendation={(item) => { void reactions.dismiss(post.plazaPostId, item); }}
                      initialSaved={savedPostIds.has(post.plazaPostId)}
                      onUserHashtagClick={handleUserHashtagClick}
                    />
                  </div>
                ))}
              </div>
            )}

            {hasNextPage && (
              <button
                type="button"
                onClick={() => { void fetchNextPage(); }}
                disabled={isFetchingNextPage}
                className="w-full mt-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 disabled:opacity-50 hover:bg-gray-50 transition-colors"
              >
                {isFetchingNextPage ? '불러오는 중...' : '게시물 더보기'}
              </button>
            )}
          </div>
        </div>

        {/* ── Right Sidebar (desktop) ── */}
        <aside className="hidden lg:flex flex-col gap-4 sticky top-20">

          {/* 해쉬태그 검색·구독 */}
          <HashtagPanel
            latestTags={latestTags}
            onUserTagClick={handleUserHashtagClick}
          />

          {/* 모집 중인 챌린지 배너 */}
          {recruitingChallenges.length > 0 && (
            <RecruitingChallengeBanner
              challenges={recruitingChallenges}
              onNavigate={(id) => navigate(`/challenges/${id}`)}
            />
          )}

        </aside>
      </div>
    </div>
  );
};
