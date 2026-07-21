import { useQuery } from '@tanstack/react-query';
import { FiLink } from 'react-icons/fi';
import { apiClient } from '@/lib/api-client';

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

  const title = data?.title || host;
  const image = data?.image ?? undefined;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 hover:bg-gray-50 ${className || ''}`}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gray-100 flex items-center justify-center">
        {image ? (
          <img src={image} alt={title} className="h-full w-full object-cover" />
        ) : (
          <FiLink className="h-5 w-5 text-gray-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
        <p className="truncate text-xs text-gray-500">{data?.siteName || host}</p>
      </div>
    </a>
  );
};
