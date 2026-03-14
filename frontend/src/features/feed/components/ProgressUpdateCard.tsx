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

export function ProgressUpdateCard({
  post,
  likeCount,
  isReacting,
  commentCount,
  commentHook,
  recommendations,
  onReact,
  onDismissRecommendation,
}: Props) {
  const state = commentHook.getState(post.plazaPostId);

  return (
    <article className="border border-blue-200 rounded-2xl p-4 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
            <span>🔵</span> 진행 업데이트
          </p>
          <h3 className="mt-1 text-sm font-semibold text-gray-900">
            {post.challengeTitle || '챌린지'}
            {post.currentDay !== undefined && (
              <span className="ml-2 text-xs font-normal text-blue-600">Day {post.currentDay}</span>
            )}
          </h3>
        </div>
        {post.challengeCategory && (
          <span className="text-[11px] text-gray-500 shrink-0">#{post.challengeCategory}</span>
        )}
      </div>

      <p className="mt-1 text-xs text-gray-400">{format(new Date(post.createdAt), 'M월 d일 HH:mm', { locale: ko })}</p>
      {post.leaderName && <p className="mt-1 text-xs text-gray-600">리더: {post.leaderName}</p>}

      {post.leaderCompletionRate !== undefined && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[11px] text-gray-500">완료율</span>
            <span className="text-[11px] text-blue-700 font-medium">{post.leaderCompletionRate}%</span>
          </div>
          <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${Math.min(100, post.leaderCompletionRate)}%` }}
            />
          </div>
        </div>
      )}

      {post.leaderMessage && (
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{post.leaderMessage}</p>
      )}
      {post.content && (
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
      )}

      {post.imageUrl && (
        isVideoUrl(post.imageUrl)
          ? <FeedVideo src={resolveMediaUrl(post.imageUrl)} />
          : <img src={resolveMediaUrl(post.imageUrl)} alt="진행 이미지" className="w-full h-44 object-cover rounded-xl mt-3" />
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
          <Link to={`/challenges/${post.challengeId}`} className="text-xs text-primary-700 underline">
            챌린지 보기
          </Link>
        )}
      </div>

      {state.isOpen && (
        <CommentSection postId={post.plazaPostId} hook={commentHook} />
      )}

      <RecommendationInline
        postId={post.plazaPostId}
        recommendations={recommendations}
        onDismiss={(pid, item) => onDismissRecommendation(item)}
      />
    </article>
  );
}
