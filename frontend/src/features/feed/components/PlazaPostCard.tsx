import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  initialSaved?: boolean;
  onUserHashtagClick?: (hashtag: string) => void;
}

export function BookmarkButton({
  plazaPostId,
  initialSaved = false,
}: {
  plazaPostId: string;
  initialSaved?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isSaved, setIsSaved] = useState(initialSaved);

  const saveMutation = useMutation({
    mutationFn: () => personalFeedApi.savePlazaPost(plazaPostId),
    onMutate: () => setIsSaved(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-saved-posts'] });
    },
    onError: () => setIsSaved(false),
  });

  const unsaveMutation = useMutation({
    mutationFn: () => personalFeedApi.unsavePlazaPost(plazaPostId),
    onMutate: () => setIsSaved(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-saved-posts'] });
    },
    onError: () => setIsSaved(true),
  });

  const isPending = saveMutation.isPending || unsaveMutation.isPending;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (isPending) return;
        isSaved ? unsaveMutation.mutate() : saveMutation.mutate();
      }}
      title={isSaved ? '저장 취소' : '내 피드에 저장'}
      className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border font-medium transition-all ${
        isSaved
          ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
          : 'bg-white text-gray-400 border-gray-200 hover:text-amber-500 hover:border-amber-200'
      }`}
    >
      <svg
        className="w-3 h-3 flex-shrink-0"
        fill={isSaved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
      {isSaved ? '저장됨' : '저장'}
    </button>
  );
}

export function PlazaPostCard({ post, initialSaved, onUserHashtagClick, ...rest }: Props) {
  const commentCount = rest.commentHook.getState(post.plazaPostId).count;

  const bookmarkButton = (
    <BookmarkButton plazaPostId={post.plazaPostId} initialSaved={initialSaved} />
  );

  const cardProps = {
    post,
    likeCount: rest.likeCount,
    isReacting: rest.isReacting,
    commentCount,
    commentHook: rest.commentHook,
    recommendations: rest.recommendations,
    onReact: rest.onReact,
    onDismissRecommendation: rest.onDismissRecommendation,
    bookmarkButton,
    onUserHashtagClick,
  };

  return (
    <motion.div
      key={post.plazaPostId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, transition: { duration: 0.18, ease: 'easeOut' } }}
      className="rounded-2xl transition-shadow duration-300 hover:shadow-xl hover:shadow-black/[0.06]"
    >
      {post.postType === 'recruitment' && <RecruitmentCard {...cardProps} />}
      {post.postType === 'progress_update' && <ProgressUpdateCard {...cardProps} />}
      {(post.postType === 'courtyard' || post.postType === 'badge_review') && (
        <VerificationCard {...cardProps} />
      )}
    </motion.div>
  );
}
