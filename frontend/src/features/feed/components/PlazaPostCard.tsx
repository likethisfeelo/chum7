import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlazaPost } from '@/features/feed/api/plazaApi';
import type { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import type { Recommendation } from '@/features/feed/hooks/usePlazaReactions';
import { RecruitmentCard } from './RecruitmentCard';
import { ProgressUpdateCard } from './ProgressUpdateCard';
import { VerificationCard } from './VerificationCard';
import { personalFeedApi } from '@/features/personal-feed/api/personalFeedApi';

interface Props {
  post: PlazaPost;
  likeCount: number;
  isReacting: boolean;
  commentHook: ReturnType<typeof usePlazaComments>;
  recommendations: Recommendation[];
  onReact: () => void;
  onDismissRecommendation: (item: Recommendation) => void;
}

function BookmarkButton({ plazaPostId }: { plazaPostId: string }) {
  const queryClient = useQueryClient();
  const [optimisticSaved, setOptimisticSaved] = useState<boolean | null>(null);

  const { data } = useQuery({
    queryKey: ['plaza-save-status', plazaPostId],
    queryFn: () => personalFeedApi.getPlazaPostSaveStatus(plazaPostId),
    staleTime: 60_000,
  });

  const isSaved = optimisticSaved ?? data?.saved ?? false;

  const saveMutation = useMutation({
    mutationFn: () => personalFeedApi.savePlazaPost(plazaPostId),
    onMutate: () => setOptimisticSaved(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaza-save-status', plazaPostId] });
      queryClient.invalidateQueries({ queryKey: ['personal-feed-saved-posts'] });
    },
    onError: () => setOptimisticSaved(null),
  });

  const unsaveMutation = useMutation({
    mutationFn: () => personalFeedApi.unsavePlazaPost(plazaPostId),
    onMutate: () => setOptimisticSaved(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaza-save-status', plazaPostId] });
      queryClient.invalidateQueries({ queryKey: ['personal-feed-saved-posts'] });
    },
    onError: () => setOptimisticSaved(null),
  });

  const isPending = saveMutation.isPending || unsaveMutation.isPending;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (isPending) return;
        isSaved ? unsaveMutation.mutate() : saveMutation.mutate();
      }}
      className={`text-base transition-colors ${isSaved ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}
      title={isSaved ? '저장 취소' : '내 피드에 저장'}
    >
      🔖
    </button>
  );
}

export function PlazaPostCard({ post, ...rest }: Props) {
  const commentCount = rest.commentHook.getState(post.plazaPostId).count;

  const cardProps = {
    post,
    likeCount: rest.likeCount,
    isReacting: rest.isReacting,
    commentCount,
    commentHook: rest.commentHook,
    recommendations: rest.recommendations,
    onReact: rest.onReact,
    onDismissRecommendation: rest.onDismissRecommendation,
  };

  return (
    <motion.div
      key={post.plazaPostId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      {/* 북마크 버튼 — 카드 우상단 overlay */}
      <div className="absolute top-3 right-3 z-10">
        <BookmarkButton plazaPostId={post.plazaPostId} />
      </div>

      {post.postType === 'recruitment' && <RecruitmentCard {...cardProps} />}
      {post.postType === 'progress_update' && <ProgressUpdateCard {...cardProps} />}
      {(post.postType === 'courtyard' || post.postType === 'badge_review') && (
        <VerificationCard {...cardProps} />
      )}
    </motion.div>
  );
}
