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
          if (play && typeof play.catch === 'function') play.catch(() => {});
          return;
        }
        element.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(element);
    return () => { observer.disconnect(); element.pause(); };
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
      className="w-full bg-black"
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

export function ProgressUpdateCard({
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
  const hashtagLabel = post.challengeCategory
    ? SLUG_TO_LABEL[post.challengeCategory] || post.challengeCategory
    : null;
  const hasMedia = Boolean(post.imageUrl);
  const isVideo = hasMedia && isVideoUrl(post.imageUrl!);

  return (
    <article className="rounded-2xl overflow-hidden glass-card">

      {/* 미디어 — 4:5 비율, 엣지-투-엣지 */}
      {hasMedia && (
        <div className="relative">
          {isVideo ? (
            <FeedVideo src={resolveMediaUrl(post.imageUrl!)} />
          ) : (
            <div className="aspect-[4/5] overflow-hidden">
              <img
                src={resolveMediaUrl(post.imageUrl!)}
                alt="진행 이미지"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {/* 유형 배지 오버레이 */}
          <div className="absolute top-3 left-3">
            <span className="text-[11px] font-semibold text-white bg-blue-600/90 backdrop-blur-sm px-2.5 py-1 rounded-full">
              🔵 진행 업데이트
            </span>
          </div>
          {bookmarkButton && (
            <div className="absolute top-3 right-3">{bookmarkButton}</div>
          )}
        </div>
      )}

      {/* 콘텐츠 */}
      <div className="p-4">
        {/* 미디어 없을 때 타입 배지 + 북마크 */}
        {!hasMedia && (
          <div className="flex items-start justify-between gap-2 mb-3">
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
              🔵 진행 업데이트
            </span>
            {bookmarkButton}
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">
            {post.challengeTitle || '챌린지'}
            {post.currentDay !== undefined && (
              <span className="ml-2 text-xs font-normal text-blue-500">Day {post.currentDay}</span>
            )}
          </h3>
          {hashtagLabel && (
            <button
              type="button"
              onClick={() => onHashtagClick?.(post.challengeCategory!)}
              className="text-[11px] text-primary-500 hover:text-primary-700 hover:underline shrink-0 font-medium transition-colors"
            >
              #{hashtagLabel}
            </button>
          )}
        </div>

        <p className="mt-1 text-xs text-gray-400">
          {format(new Date(post.createdAt), 'M월 d일 HH:mm', { locale: ko })}
        </p>
        {post.leaderName && (
          <p className="mt-1 text-xs text-gray-500">리더: {post.leaderName}</p>
        )}

        {/* 완료율 프로그레스바 */}
        {post.leaderCompletionRate !== undefined && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-500">완료율</span>
              <span className="text-[11px] text-blue-600 font-semibold">
                {post.leaderCompletionRate}%
              </span>
            </div>
            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, post.leaderCompletionRate)}%` }}
              />
            </div>
          </div>
        )}

        {post.leaderMessage && (
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {post.leaderMessage}
          </p>
        )}
        {post.content && (
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>
        )}

        {/* 액션바 */}
        <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2 flex-wrap">
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
          {bookmarkButton && hasMedia && (
            <div className="ml-auto">{bookmarkButton}</div>
          )}
          {post.challengeId && (
            <Link
              to={`/challenges/${post.challengeId}`}
              className="ml-auto text-xs text-primary-600 hover:text-primary-800 font-medium"
            >
              챌린지 보기 →
            </Link>
          )}
        </div>

        {state.isOpen && <CommentSection postId={post.plazaPostId} hook={commentHook} />}
        <RecommendationInline
          postId={post.plazaPostId}
          recommendations={recommendations}
          onDismiss={(_pid, item) => onDismissRecommendation(item)}
        />
      </div>
    </article>
  );
}
