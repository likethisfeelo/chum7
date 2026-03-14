import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { CommentSection } from './CommentSection';
import { RecommendationInline } from './RecommendationInline';
import type { PlazaPost } from '@/features/feed/api/plazaApi';
import type { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import type { Recommendation } from '@/features/feed/hooks/usePlazaReactions';

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.m4v');
}

function FeedVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          const play = element.play();
          if (play && typeof play.catch === 'function') {
            play.catch(() => {});
          }
          return;
        }
        element.pause();
      },
      { threshold: [0, 0.6, 1] },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      element.pause();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      loop
      muted
      playsInline
      preload="metadata"
      className="w-full rounded-xl mt-3 bg-black"
    />
  );
}

interface Props {
  post: PlazaPost;
  likeCount: number;
  isReacting: boolean;
  commentCount: number;
  commentHook: ReturnType<typeof usePlazaComments>;
  recommendations: Recommendation[];
  onReact: () => void;
  onDismissRecommendation: (item: Recommendation) => void;
}

export function VerificationCard({
  post,
  likeCount,
  isReacting,
  commentCount: _commentCount,
  commentHook,
  recommendations,
  onReact,
  onDismissRecommendation,
}: Props) {
  const state = commentHook.getState(post.plazaPostId);
  const isBadge = post.postType === 'badge_review';

  return (
    <article className="border border-gray-200 rounded-2xl p-4 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
            <span>{isBadge ? '🏅' : '🌿'}</span>
            {isBadge ? '뱃지 후기' : '인증 기록'}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-gray-900">{post.challengeTitle || '챌린지'}</h3>
        </div>
        {post.challengeCategory && (
          <span className="text-[11px] text-gray-500 shrink-0">#{post.challengeCategory}</span>
        )}
      </div>

      <p className="mt-1 text-xs text-gray-400">{format(new Date(post.createdAt), 'M월 d일 HH:mm', { locale: ko })}</p>

      {/* 미디어를 focal element로 */}
      {post.imageUrl && (
        isVideoUrl(post.imageUrl)
          ? <FeedVideo src={resolveMediaUrl(post.imageUrl)} />
          : <img src={resolveMediaUrl(post.imageUrl)} alt="인증 이미지" className="w-full h-48 object-cover rounded-xl mt-3" />
      )}

      {post.content && (
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onReact}
          disabled={isReacting}
          className="px-2.5 py-1 text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50"
        >
          {isReacting ? '...' : `❤️ ${likeCount}`}
        </button>
        <button
          type="button"
          onClick={() => { void commentHook.toggle(post.plazaPostId); }}
          className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-700"
        >
          💬 댓글 {state.count}
        </button>
        {post.challengeId && (
          <Link to={`/challenges/${post.challengeId}`} className="text-xs text-primary-700 underline ml-auto">
            챌린지 보러가기
          </Link>
        )}
      </div>

      {state.isOpen && (
        <CommentSection postId={post.plazaPostId} hook={commentHook} />
      )}

      <RecommendationInline
        postId={post.plazaPostId}
        recommendations={recommendations}
        onDismiss={(_pid, item) => onDismissRecommendation(item)}
      />
    </article>
  );
}
