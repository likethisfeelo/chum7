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
  /** 카드(본문 영역) 클릭 시 상세 박스 열기 */
  onOpenDetail?: (post: PlazaPost) => void;
  /** 이미지 클릭 시 라이트박스 열기 */
  onOpenImage?: (post: PlazaPost) => void;
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
      aria-label={isSaved ? '저장 취소' : '내 피드에 저장'}
      className={`p-1 transition-opacity ${
        isSaved ? 'text-amber-500 opacity-80' : 'text-gray-500 opacity-50 hover:opacity-80'
      }`}
    >
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill={isSaved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  );
}

export function PlazaPostCard({ post, initialSaved, onUserHashtagClick, onOpenDetail, onOpenImage, ...rest }: Props) {
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
    onOpenImage,
  };

  // 카드 클릭 → 상세 박스. 단, 버튼/링크/입력(좋아요·댓글·북마크·해시태그·이미지 등)은 제외.
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onOpenDetail) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, video, [data-no-detail]')) return;
    onOpenDetail(post);
  };

  return (
    <motion.div
      key={post.plazaPostId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, transition: { duration: 0.18, ease: 'easeOut' } }}
      onClick={handleCardClick}
      className={`relative rounded-2xl transition-shadow duration-300 hover:shadow-xl hover:shadow-black/[0.06] ${
        onOpenDetail ? 'cursor-pointer' : ''
      }`}
    >
      {post.isOfficial && (
        <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
          📣 {post.officialLabel || '운영자'}
        </span>
      )}
      {post.postType === 'recruitment' && <RecruitmentCard {...cardProps} />}
      {post.postType === 'progress_update' && <ProgressUpdateCard {...cardProps} />}
      {(post.postType === 'courtyard' || post.postType === 'badge_review') && (
        <VerificationCard {...cardProps} />
      )}
    </motion.div>
  );
}
