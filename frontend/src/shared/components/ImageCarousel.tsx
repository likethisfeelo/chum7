import { useRef, useState } from 'react';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';

// 인스타그램식 이미지 슬라이드 — 가로 스와이프(scroll-snap) + 인디케이터.
// 인증 피드/마당에서 공용으로 사용. 이미지 URL은 resolveMediaUrl로 렌더.
export function ImageCarousel({
  images,
  aspect = 'aspect-[4/5]',
  rounded = '',
  showCounter = true,
}: {
  images: string[];
  aspect?: string;
  rounded?: string;
  showCounter?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const list = (images || []).filter(Boolean);
  if (list.length === 0) return null;

  if (list.length === 1) {
    return (
      <div className={`${aspect} overflow-hidden ${rounded}`}>
        <img src={resolveMediaUrl(list[0])} alt="" loading="lazy" className="w-full h-full object-cover" />
      </div>
    );
  }

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== idx) setIdx(Math.max(0, Math.min(list.length - 1, i)));
  };

  return (
    <div className={`relative ${aspect} overflow-hidden ${rounded}`}>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex h-full w-full overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {list.map((src, i) => (
          <div key={i} className="snap-center shrink-0 w-full h-full">
            <img src={resolveMediaUrl(src)} alt="" loading="lazy" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>

      {showCounter && (
        <div className="absolute top-3 right-3 bg-black/55 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full pointer-events-none">
          {idx + 1}/{list.length}
        </div>
      )}

      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
        {list.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
          />
        ))}
      </div>
    </div>
  );
}
