import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { SLUG_TO_LABEL } from '@/features/challenge/constants/categories';
import { CommentSection } from './CommentSection';
import { RecommendationInline } from './RecommendationInline';
import type { PlazaPost } from '@/features/feed/api/plazaApi';
import type { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import type { Recommendation } from '@/features/feed/hooks/usePlazaReactions';

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.m4v');
}

function FeedImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-full h-48 rounded-xl mt-3 bg-gray-100 flex items-center justify-center text-xs text-gray-400">
        이미지를 불러올 수 없습니다
      </div>
    );
  }
  return (
    <img
      src={src}
      alt="인증 이미지"
      className="w-full h-48 object-cover rounded-xl mt-3"
      onError={() => setFailed(true)}
    />
  );
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
  bookmarkButton?: React.ReactNode;
  onHashtagClick?: (slug: string) => void;
  onUserHashtagClick?: (hashtag: string) => void;
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
  bookmarkButton,
  onHashtagClick,
  onUserHashtagClick,
}: Props) {
  const state = commentHook.getState(post.plazaPostId);
  const isBadge = post.postType === 'badge_review';
  const hashtagLabel = post.challengeCategory
    ? SLUG_TO_LABEL[post.challengeCategory] || post.challengeCategory
    : null;

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
        {hashtagLabel && (
          <button
            type="button"
            onClick={() => onHashtagClick?.(post.challengeCategory!)}
            className="text-[11px] text-indigo-500 hover:text-indigo-700 hover:underline shrink-0 font-medium transition-colors"
          >
            #{hashtagLabel}
          </button>
        )}
      </div>

      <p className="mt-1 text-xs text-gray-400">{format(new Date(post.createdAt), 'M월 d일 HH:mm', { locale: ko })}</p>

      {post.imageUrl && (
        isVideoUrl(post.imageUrl)
          ? <FeedVideo src={resolveMediaUrl(post.imageUrl)} />
          : <FeedImage src={resolveMediaUrl(post.imageUrl)} />
      )}

      {post.content && (
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onReact}
          disabled={isReacting}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50 transition-colors hover:bg-emerald-100"
        >
          {isReacting ? '...' : `❤️ ${likeCount}`}
        </button>
        <button
          type="button"
          onClick={() => { void commentHook.toggle(post.plazaPostId); }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
        >
          💬 {state.count}
        </button>
        {bookmarkButton}
        {post.hashtag && (
          <button
            type="button"
            onClick={() => onUserHashtagClick?.(post.hashtag!)}
            className="px-2 py-1 text-xs rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-medium"
          >
            #{post.hashtag}
          </button>
        )}
        {post.challengeId && (
          <Link
            to={`/challenges/${post.challengeId}`}
            className="ml-auto text-xs text-primary-700 hover:text-primary-900 font-medium"
          >
            챌린지 보러가기 →
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
