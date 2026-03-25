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
      <div className="w-full h-48 rounded-xl bg-gray-100 flex items-center justify-center text-xs text-gray-400">
        이미지를 불러올 수 없습니다
      </div>
    );
  }
  return (
    <img
      src={src}
      alt="인증 이미지"
      className="w-full h-48 object-cover rounded-xl"
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
      className="w-full rounded-xl bg-black"
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

  return (
    <article className="border border-gray-200 rounded-2xl p-4 bg-white">

      {/* 상단: 저장 버튼 */}
      {bookmarkButton && (
        <div className="flex justify-end mb-3">
          {bookmarkButton}
        </div>
      )}

      {/* 미디어 */}
      {hasMedia && (
        <div className="mb-3">
          {isVideoUrl(post.imageUrl!)
            ? <FeedVideo src={resolveMediaUrl(post.imageUrl!)} />
            : <FeedImage src={resolveMediaUrl(post.imageUrl!)} />
          }
        </div>
      )}

      {/* 본문 텍스트 (텍스트만 있을 경우 내용에 따라 높이 자동 조절) */}
      {post.content && (
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {post.content}
        </p>
      )}

      {/* 유저 해쉬태그 — 본문 좌측 아래 */}
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
            className="text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            #{post.hashtag}
          </button>
        </div>
      )}

      {/* 액션바: 좋아요·댓글 / 날짜 */}
      <div className="mt-3 flex items-center gap-2">
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

        {/* 날짜·시간 — 우측 하단에 작게 */}
        <span className="ml-auto text-[11px] text-gray-400">
          {format(new Date(post.createdAt), 'M월 d일 HH:mm', { locale: ko })}
        </span>
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
