import { motion } from 'framer-motion';
import type { PlazaPost } from '@/features/feed/api/plazaApi';
import type { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import type { Recommendation } from '@/features/feed/hooks/usePlazaReactions';
import { RecruitmentCard } from './RecruitmentCard';
import { ProgressUpdateCard } from './ProgressUpdateCard';
import { VerificationCard } from './VerificationCard';

interface Props {
  post: PlazaPost;
  likeCount: number;
  isReacting: boolean;
  commentHook: ReturnType<typeof usePlazaComments>;
  recommendations: Recommendation[];
  onReact: () => void;
  onDismissRecommendation: (item: Recommendation) => void;
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
    >
      {post.postType === 'recruitment' && <RecruitmentCard {...cardProps} />}
      {post.postType === 'progress_update' && <ProgressUpdateCard {...cardProps} />}
      {(post.postType === 'courtyard' || post.postType === 'badge_review') && (
        <VerificationCard {...cardProps} />
      )}
    </motion.div>
  );
}
