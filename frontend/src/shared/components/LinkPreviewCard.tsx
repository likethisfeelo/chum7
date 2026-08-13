import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FiLink } from 'react-icons/fi';
import { apiClient } from '@/lib/api-client';
import { youtubeThumbnail, youtubeVideoId } from '@/shared/utils/youtube';

interface LinkPreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
}

interface LinkPreviewCardProps {
  url: string;
  className?: string;
}

function getHostLabel(inputUrl: string): string {
  try {
    return new URL(inputUrl).hostname.replace(/^www\./, '');
  } catch {
    return inputUrl;
  }
}

export const LinkPreviewCard = ({ url, className }: LinkPreviewCardProps) => {
  const host = getHostLabel(url);

  // challenge-api PORTING.md §7-d — OG 프리뷰 프록시. 에러 시 호스트명 기반 기본 카드로 폴백.
  const { data } = useQuery<LinkPreviewData | null>({
    queryKey: ['link-preview', url],
    queryFn: async () => {
      const res = await apiClient.get(`/public/link-preview?url=${encodeURIComponent(url)}`);
      return res.data.data as LinkPreviewData;
    },
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });

  // 유튜브는 API 응답 없이도 videoId로 썸네일을 만들 수 있다 — 프리뷰 실패 시 폴백
  const videoId = youtubeVideoId(url);
  const [thumbFailed, setThumbFailed] = useState(false);

  const title = data?.title || host;
  const image = (data?.image ?? (videoId ? youtubeThumbnail(videoId) : null)) ?? undefined;
  const description = data?.description ?? undefined;
  const siteLabel = data?.siteName || (videoId ? 'YouTube' : host);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 flex items-stretch gap-3 rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50 transition-colors ${className || ''}`}
    >
      <div className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-gray-100 flex items-center justify-center">
        {image && !thumbFailed ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            // 썸네일 접근 실패(핫링크 차단 등) — 아이콘 자리로 되돌린다
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <FiLink className="h-5 w-5 text-gray-400" />
        )}
      </div>
      <div className="min-w-0 flex-1 self-center">
        <p className="line-clamp-2 text-sm font-semibold text-gray-900 leading-snug">{title}</p>
        {description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{description}</p>
        )}
        <p className="mt-0.5 truncate text-[11px] text-gray-400">{siteLabel}</p>
      </div>
    </a>
  );
};
