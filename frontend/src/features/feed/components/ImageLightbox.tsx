import { useEffect, useState } from 'react';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';

interface Props {
  images: string[];
  content?: string;
  /** 시작 인덱스 (기본 0) */
  startIndex?: number;
  onClose: () => void;
}

/**
 * 마당 게시물 이미지 라이트박스 — 전체화면 큰 이미지(object-contain) + 하단 오버레이 본문.
 * 배경/바깥 클릭·X·Esc 로 닫힘. 이미지가 여러 장이면 좌우로 넘긴다.
 */
export function ImageLightbox({ images, content, startIndex = 0, onClose }: Props) {
  const count = images.length;
  const [idx, setIdx] = useState(() => Math.min(Math.max(startIndex, 0), Math.max(count - 1, 0)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (count > 1 && e.key === 'ArrowRight') setIdx((i) => (i + 1) % count);
      else if (count > 1 && e.key === 'ArrowLeft') setIdx((i) => (i - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [count, onClose]);

  if (!count) return null;
  const src = resolveMediaUrl(images[idx]!);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* 닫기 */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="닫기"
        className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white/80 hover:bg-white/20 hover:text-white"
      >
        ×
      </button>

      {count > 1 && (
        <div className="absolute top-5 left-1/2 z-20 -translate-x-1/2 text-xs font-medium text-white/80">
          {idx + 1} / {count}
        </div>
      )}

      {/* 이미지 — 화면에 맞춰 전체 표시 */}
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <img
          src={src}
          alt=""
          className="max-h-full max-w-full select-none object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* 좌우 네비 */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + count) % count); }}
            aria-label="이전 이미지"
            className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white/80 hover:bg-white/20 hover:text-white"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % count); }}
            aria-label="다음 이미지"
            className="absolute right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white/80 hover:bg-white/20 hover:text-white"
          >
            ›
          </button>
        </>
      )}

      {/* 하단 오버레이 본문 */}
      {content && (
        <div
          className="absolute inset-x-0 bottom-0 max-h-[45%] overflow-y-auto bg-gradient-to-t from-black/90 via-black/70 to-transparent px-5 pb-6 pt-12"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white">{content}</p>
        </div>
      )}
    </div>
  );
}
