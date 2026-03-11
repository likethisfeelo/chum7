import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
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

  const isHttps = url.startsWith('https://');

  const { data } = useQuery({
    queryKey: ['link-preview', url],
    queryFn: async () => {
      const res = await apiClient.get('/verifications/link-preview', { params: { url } });
      return res.data?.data || null;
    },
    enabled: Boolean(url) && isHttps,
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
