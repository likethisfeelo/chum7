import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchPlazaFeed } from '@/features/feed/api/plazaApi';

export type PlazaFilter = 'all' | 'recruiting' | 'ongoing' | 'records';

function mapFilterToApi(filter: PlazaFilter): 'all' | 'recruiting' | 'in_progress' | 'completed' {
  if (filter === 'recruiting') return 'recruiting';
  if (filter === 'ongoing') return 'in_progress';
  if (filter === 'records') return 'completed';
  return 'all';
}

export function usePlazaFeed(filter: PlazaFilter, category?: string, hashtag?: string) {
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['plaza-feed', filter, category ?? '', hashtag ?? ''],
    // 마당은 인증 제출 즉시 변환되므로 전역 5분 대신 짧게 — 재방문/포커스 시 새 글 반영
    staleTime: 60 * 1000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => fetchPlazaFeed({
      filter: mapFilterToApi(filter),
      category: category || undefined,
      hashtag: hashtag || undefined,
      cursor: pageParam,
      limit: 20,
    }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
  });

  const posts = data?.pages?.flatMap((page) => page.posts || []) || [];

  return {
    posts,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  };
}
