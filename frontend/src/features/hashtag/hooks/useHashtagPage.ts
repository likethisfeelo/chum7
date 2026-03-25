import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hashtagApi } from '../api/hashtagApi';

export function useHashtagPage(tag: string) {
  const queryClient = useQueryClient();

  const metaQuery = useQuery({
    queryKey: ['hashtag-meta', tag],
    queryFn: () => hashtagApi.getMeta(tag),
    enabled: Boolean(tag),
  });

  const postsQuery = useInfiniteQuery({
    queryKey: ['hashtag-posts', tag],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => hashtagApi.getPosts(tag, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(tag),
  });

  const followStatusQuery = useQuery({
    queryKey: ['hashtag-follow-status', tag],
    queryFn: () => hashtagApi.getFollowStatus(tag),
    enabled: Boolean(tag),
  });

  const followMutation = useMutation({
    mutationFn: () => hashtagApi.follow(tag),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['hashtag-follow-status', tag] });
      const prev = queryClient.getQueryData(['hashtag-follow-status', tag]);
      queryClient.setQueryData(['hashtag-follow-status', tag], { followed: true, followId: null });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['hashtag-follow-status', tag], ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['hashtag-follow-status', tag] });
      void queryClient.invalidateQueries({ queryKey: ['hashtag-meta', tag] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => hashtagApi.unfollow(tag),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['hashtag-follow-status', tag] });
      const prev = queryClient.getQueryData(['hashtag-follow-status', tag]);
      queryClient.setQueryData(['hashtag-follow-status', tag], { followed: false, followId: null });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['hashtag-follow-status', tag], ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['hashtag-follow-status', tag] });
      void queryClient.invalidateQueries({ queryKey: ['hashtag-meta', tag] });
    },
  });

  const posts = postsQuery.data?.pages.flatMap((p) => p.posts) ?? [];
  const followed = followStatusQuery.data?.followed ?? false;
  const isPendingFollow = followMutation.isPending || unfollowMutation.isPending;

  function toggleFollow() {
    if (isPendingFollow) return;
    if (followed) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  }

  return {
    meta: metaQuery.data ?? null,
    isMetaLoading: metaQuery.isLoading,
    isMetaError: metaQuery.isError,
    posts,
    isPostsLoading: postsQuery.isLoading,
    hasNextPage: postsQuery.hasNextPage,
    fetchNextPage: postsQuery.fetchNextPage,
    isFetchingNextPage: postsQuery.isFetchingNextPage,
    followed,
    isPendingFollow,
    toggleFollow,
  };
}
