import { useEffect, useRef } from 'react';
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
}

export function RecruitmentCard({
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
}: Props) {
  const state = commentHook.getState(post.plazaPostId);
  const isUrgent = (post.daysUntilClose ?? Infinity) <= 7;
  const isAlmostFull = (post.remainingSlots ?? Infinity) <= 3;
  const hashtagLabel = post.challengeCategory
    ? SLUG_TO_LABEL[post.challengeCategory] || post.challengeCategory
    : null;

  return (
    <article className="border border-green-200 rounded-2xl p-4 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-green-700 flex items-center gap-1">
            <span>🟢</span> 모집 공고
            {isUrgent && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-orange-100 text-orange-700">
                마감 임박
              </span>
            )}
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
      {post.leaderName && <p className="mt-1 text-xs text-gray-600">리더: {post.leaderName}</p>}

      {post.recruitMessage && (
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{post.recruitMessage}</p>
      )}
      {post.leaderMessage && (
        <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{post.leaderMessage}</p>
      )}

      {post.imageUrl && (
        isVideoUrl(post.imageUrl)
          ? <FeedVideo src={resolveMediaUrl(post.imageUrl)} />
          : <img src={resolveMediaUrl(post.imageUrl)} alt="모집 이미지" className="w-full h-44 object-cover rounded-xl mt-3" />
      )}

      {(post.remainingSlots !== undefined || post.totalSlots !== undefined) && (
        <p className={`mt-2 text-xs font-medium ${isAlmostFull ? 'text-orange-600' : 'text-gray-500'}`}>
          잔여 자리: {post.remainingSlots ?? 0} / {post.totalSlots ?? 0}
          {post.daysUntilClose !== undefined && ` · ${post.daysUntilClose}일 남음`}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {post.challengeId && (
          <Link
            to={`/challenges/${post.challengeId}`}
            className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
          >
            챌린지 보러가기 →
          </Link>
        )}
        <button
          type="button"
          onClick={onReact}
          disabled={isReacting}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50 hover:bg-emerald-100 transition-colors"
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
