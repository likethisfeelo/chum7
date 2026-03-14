import { useEffect, useState } from 'react';

import { EmptyState } from '@/shared/components/EmptyState';
import { SkeletonList } from '@/shared/components/Skeleton';

import { AnonymousModeBanner } from '@/features/feed/components/AnonymousModeBanner';
import { PlazaFilterTabs } from '@/features/feed/components/PlazaFilterTabs';
import { PlazaPostCard } from '@/features/feed/components/PlazaPostCard';
import { usePlazaFeed, type PlazaFilter } from '@/features/feed/hooks/usePlazaFeed';
import { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import { usePlazaReactions } from '@/features/feed/hooks/usePlazaReactions';

const ANONYMITY_STORAGE_KEY = 'outer-space-anonymous-mode';

export const FeedPage = () => {
  const [plazaFilter, setPlazaFilter] = useState<PlazaFilter>('all');
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);

  useEffect(() => {
    setIsAnonymousMode(localStorage.getItem(ANONYMITY_STORAGE_KEY) === 'true');
  }, []);

  const { posts, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = usePlazaFeed(plazaFilter);

  const commentHook = usePlazaComments();

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
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-2xl font-bold text-gray-900">마당 🚀</h1>
        <p className="text-sm text-gray-600 mt-1">광장 피드 · 반익명 커뮤니티</p>
      </div>

      <div className="px-6 py-5 max-w-3xl mx-auto space-y-5">
        <AnonymousModeBanner isActive={isAnonymousMode} onToggle={toggleAnonymousMode} />

        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <PlazaFilterTabs value={plazaFilter} onChange={setPlazaFilter} />

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <SkeletonList count={3} />
            ) : isError ? (
              <EmptyState icon="⚠️" title="광장 피드를 불러오지 못했어요" description="잠시 후 다시 시도해주세요." />
            ) : posts.length === 0 ? (
              <EmptyState icon="🌌" title="아직 게시물이 없어요" description="곧 마당 게시물이 여기에 표시됩니다." />
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
    </div>
  );
};
