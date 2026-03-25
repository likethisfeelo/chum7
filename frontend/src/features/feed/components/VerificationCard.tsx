import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

function FeedImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-full h-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
        이미지를 불러올 수 없습니다
      </div>
    );
  }
  return (
    <img
      src={src}
      alt="인증 이미지"
      className="w-full h-full object-cover"
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
  onUserHashtagClick?: (hashtag: string) => void;
}

export function VerificationCard({
  post,
  likeCount,
  isReacting,
  commentHook,
  recommendations,
  onReact,
  onDismissRecommendation,
  bookmarkButton,
  onUserHashtagClick,
}: Props) {
  const navigate = useNavigate();
  const state = commentHook.getState(post.plazaPostId);
  const hasMedia = Boolean(post.imageUrl);
  const isVideo = hasMedia && isVideoUrl(post.imageUrl!);

  return (
    <article className="rounded-2xl overflow-hidden bg-white shadow-sm">

      {/* 미디어 — 4:5 비율, 엣지-투-엣지 */}
      {hasMedia && (
        <div className="relative">
          {isVideo ? (
            <FeedVideo src={resolveMediaUrl(post.imageUrl!)} />
          ) : (
            <div className="aspect-[4/5] overflow-hidden">
              <FeedImage src={resolveMediaUrl(post.imageUrl!)} />
            </div>
          )}
          {/* 북마크 — 이미지 위 오버레이 */}
          {bookmarkButton && (
            <div className="absolute top-3 right-3">
              {bookmarkButton}
            </div>
          )}
        </div>
      )}

      {/* 콘텐츠 */}
      <div className="p-4">
        {/* 미디어 없을 때 북마크 */}
        {!hasMedia && bookmarkButton && (
          <div className="flex justify-end mb-3">{bookmarkButton}</div>
        )}

        {post.content && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>
        )}

        {post.hashtag && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                if (onUserHashtagClick) {
                  onUserHashtagClick(post.hashtag!);
                } else {
                  navigate(`/hashtag/${encodeURIComponent(post.hashtag!)}`);
                }
              }}
              className="text-xs font-medium text-primary-500 hover:text-primary-700 transition-colors"
            >
              #{post.hashtag}
            </button>
          </div>
        )}

        {/* 액션바 */}
        <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2">
          <button
            type="button"
            onClick={onReact}
            disabled={isReacting}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-50 transition-colors hover:bg-gray-50"
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
          <span className="ml-auto text-[11px] text-gray-400">
            {format(new Date(post.createdAt), 'M월 d일 HH:mm', { locale: ko })}
          </span>
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
