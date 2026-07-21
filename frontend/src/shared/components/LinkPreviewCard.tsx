import { useQuery } from '@tanstack/react-query';
import { FiLink } from 'react-icons/fi';

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

  const { data } = useQuery({
    queryKey: ['link-preview', url],
    // NOT_PORTED: GET /verifications/link-preview — 외부 URL 프리뷰 프록시는 신규 백엔드 미이식
    // (challenge-api PORTING.md §B). 호스트명 기반 기본 카드로 폴백 (쿼리 비활성).
    queryFn: async () => null as any,
    enabled: false,
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });

  const title = data?.title || host;
  const image = data?.image as string | undefined;

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
