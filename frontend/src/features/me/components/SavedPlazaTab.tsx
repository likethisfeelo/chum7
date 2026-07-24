import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { personalFeedApi } from '@/features/personal-feed/api/personalFeedApi';
import { fetchPlazaPost, type PlazaPost } from '@/features/feed/api/plazaApi';
import { PlazaPostCard } from '@/features/feed/components/PlazaPostCard';
import { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import { usePlazaReactions } from '@/features/feed/hooks/usePlazaReactions';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';

/**
 * 저장(북마크)한 마당 게시물을 다시 보는 탭.
 * 저장 목록(plazaPostId)만 오므로 게시물마다 단건 조회 후 카드로 렌더 — 본문 + 댓글 포함.
 * 삭제된 게시물(단건 조회 null)은 목록에서 자동 제외.
 */
export function SavedPlazaTab() {
  const { data: savedData, isLoading: savedLoading } = useQuery({
    queryKey: ['personal-feed-saved-posts'],
    queryFn: () => personalFeedApi.getSavedPosts(),
  });

  const savedItems = savedData?.savedPosts ?? [];
  const idKey = savedItems.map((s) => s.plazaPostId).join(',');

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['saved-plaza-posts', idKey],
    enabled: savedItems.length > 0,
    queryFn: async () => {
      const results = await Promise.all(savedItems.map((s) => fetchPlazaPost(s.plazaPostId)));
      return results.filter((p): p is PlazaPost => Boolean(p));
    },
  });

  const initialCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of posts) map[p.plazaPostId] = Number(p.commentCount ?? 0);
    return map;
  }, [posts]);

  const initialLikeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of posts) map[p.plazaPostId] = Number(p.likeCount ?? 0);
    return map;
  }, [posts]);

  const commentHook = usePlazaComments(initialCounts);
  const reactions = usePlazaReactions(initialLikeCounts);

  if (savedLoading || (savedItems.length > 0 && postsLoading)) return <Loading />;

  if (savedItems.length === 0) {
    return (
      <EmptyState
        icon="🔖"
        title="저장한 게시물이 없어요"
        description="마당에서 마음에 드는 기록을 저장해보세요."
      />
    );
  }

  if (posts.length === 0) {
    return (
      <EmptyState
        icon="🔖"
        title="저장한 게시물을 볼 수 없어요"
        description="저장했던 게시물이 삭제되었을 수 있어요."
      />
    );
  }

  return (
    <div className="space-y-3 pb-24">
      {posts.map((post) => (
        <PlazaPostCard
          key={post.plazaPostId}
          post={post}
          likeCount={reactions.countMap[post.plazaPostId] ?? Number(post.likeCount ?? 0)}
          isReacting={Boolean(reactions.reactingIds[post.plazaPostId])}
          commentHook={commentHook}
          recommendations={reactions.recommendationsByPost[post.plazaPostId] ?? []}
          onReact={() => { void reactions.react(post); }}
          onDismissRecommendation={(item) => { void reactions.dismiss(post.plazaPostId, item); }}
          initialSaved
        />
      ))}
    </div>
  );
}
