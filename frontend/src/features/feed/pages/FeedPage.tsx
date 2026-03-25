import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SLUG_TO_COLOR } from '@/features/challenge/constants/categories';

import { EmptyState } from '@/shared/components/EmptyState';
import { SkeletonList } from '@/shared/components/Skeleton';

import { AnonymousModeBanner } from '@/features/feed/components/AnonymousModeBanner';
import { PlazaFilterTabs } from '@/features/feed/components/PlazaFilterTabs';
import { PlazaPostCard } from '@/features/feed/components/PlazaPostCard';
import { usePlazaFeed, type PlazaFilter } from '@/features/feed/hooks/usePlazaFeed';
import { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import { usePlazaReactions } from '@/features/feed/hooks/usePlazaReactions';
import { apiClient } from '@/lib/api-client';
import { CHALLENGE_CATEGORIES } from '@/features/challenge/constants/categories';

const ANONYMITY_STORAGE_KEY = 'outer-space-anonymous-mode';

export const FeedPage = () => {
  const navigate = useNavigate();
  const [plazaFilter, setPlazaFilter] = useState<PlazaFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);

  const { data: hotChallengesData } = useQuery({
    queryKey: ['feed-hot-challenges'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges?lifecycle=active&limit=5');
      return response.data.data?.challenges || [];
    },
    staleTime: 3 * 60 * 1000,
  });

  useEffect(() => {
    setIsAnonymousMode(localStorage.getItem(ANONYMITY_STORAGE_KEY) === 'true');
  }, []);

  const { posts, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = usePlazaFeed(
    plazaFilter,
    selectedCategory ?? undefined,
  );

  const handleCategorySelect = (slug: string) => {
    setSelectedCategory((prev) => (prev === slug ? null : slug));
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
  // reactions 객체는 렌더마다 새로 만들어지지 않으므로 posts 변경 시에만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  const toggleAnonymousMode = () => {
    setIsAnonymousMode((prev) => {
      const next = !prev;
      localStorage.setItem(ANONYMITY_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">마당 🚀</h1>
          <p className="text-sm text-gray-600 mt-1">광장 피드 · 반익명 커뮤니티</p>
        </div>

        {/* 카테고리 필터 — 모바일/태블릿 가로 스크롤 */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setSelectedCategory(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !selectedCategory
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            전체
          </button>
          {CHALLENGE_CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => handleCategorySelect(cat.slug)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === cat.slug
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

      {/* Desktop: 2-column layout */}
      <div className="px-4 lg:px-6 py-5 max-w-6xl mx-auto lg:grid lg:grid-cols-[1fr_288px] lg:gap-6 lg:items-start space-y-5 lg:space-y-0">

        {/* ── Main Feed ── */}
        <div className="space-y-5">
          <AnonymousModeBanner isActive={isAnonymousMode} onToggle={toggleAnonymousMode} />

          <section className="bg-white border border-gray-200 rounded-2xl p-4">
            <PlazaFilterTabs value={plazaFilter} onChange={setPlazaFilter} />

            {/* 활성 카테고리 뱃지 */}
            {selectedCategory && (() => {
              const cat = CHALLENGE_CATEGORIES.find((c) => c.slug === selectedCategory);
              return cat ? (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${SLUG_TO_COLOR[cat.slug] || 'bg-gray-100 text-gray-600'}`}>
                    {cat.emoji} {cat.label}
                  </span>
                  <span className="text-xs text-gray-400">카테고리 필터 적용 중</span>
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    필터 해제
                  </button>
                </div>
              ) : null;
            })()}

            <div className="mt-4 space-y-3">
              {isLoading ? (
                <SkeletonList count={3} />
              ) : isError ? (
                <EmptyState icon="⚠️" title="광장 피드를 불러오지 못했어요" description="잠시 후 다시 시도해주세요." />
              ) : posts.length === 0 ? (
                <EmptyState
                  icon="🌌"
                  title={selectedCategory ? "해당 카테고리 게시물이 없어요" : "아직 게시물이 없어요"}
                  description={selectedCategory ? "다른 카테고리를 탐색해보세요" : "곧 마당 게시물이 여기에 표시됩니다."}
                />
              ) : posts.map((post) => (
                <PlazaPostCard
                  key={post.plazaPostId}
                  post={post}
                  likeCount={reactions.countMap[post.plazaPostId] ?? Number(post.likeCount ?? 0)}
                  isReacting={Boolean(reactions.reactingIds[post.plazaPostId])}
                  commentHook={commentHook}
                  recommendations={reactions.recommendationsByPost[post.plazaPostId] ?? []}
                  onReact={() => { void reactions.react(post); }}
                  onDismissRecommendation={(item) => { void reactions.dismiss(post.plazaPostId, item); }}
                />
              ))}

              {hasNextPage && (
                <button
                  type="button"
                  onClick={() => { void fetchNextPage(); }}
                  disabled={isFetchingNextPage}
                  className="w-full py-2 text-sm rounded-xl border border-gray-200 bg-white text-gray-700 disabled:opacity-50"
                >
                  {isFetchingNextPage ? '불러오는 중...' : '게시물 더보기'}
                </button>
              )}
            </div>
          </section>
        </div>

        {/* ── Right Sidebar (desktop only) ── */}
        <aside className="hidden lg:block space-y-4 sticky top-20">

          {/* 카테고리 필터 */}
          <section className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">카테고리</h3>
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  전체 보기
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {CHALLENGE_CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.slug;
                return (
                  <button
                    key={cat.slug}
                    onClick={() => handleCategorySelect(cat.slug)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                    {isActive && <span className="ml-auto text-white/60">✓</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 활발한 챌린지 */}
          {hotChallengesData && hotChallengesData.length > 0 && (
            <section className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">🔥 진행 중인 챌린지</h3>
                <button
                  onClick={() => navigate('/challenges')}
                  className="text-xs text-primary-600 font-medium hover:text-primary-800"
                >
                  전체 보기
                </button>
              </div>
              <div className="space-y-2">
                {hotChallengesData.slice(0, 4).map((ch: any) => (
                  <button
                    key={ch.challengeId}
                    onClick={() => navigate(`/challenges/${ch.challengeId}`)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors text-left"
                  >
                    <span className="text-xl flex-shrink-0">{ch.badgeIcon || '🎯'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{ch.title}</p>
                      <p className="text-xs text-gray-400">👥 {ch.stats?.totalParticipants || 0}명</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

        </aside>

      </div>
    </div>
  );
};
