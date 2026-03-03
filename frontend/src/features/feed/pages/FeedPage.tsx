import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiHeart } from 'react-icons/fi';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import toast from 'react-hot-toast';

const FILTER_GUIDE_TEXT: Record<'all' | 'extra', string> = {
  all: '오늘의 핵심 인증과 공개된 추가 기록을 함께 볼 수 있어요.',
  extra: '추가 기록만 모아보며 복기/회고 흐름을 확인할 수 있어요.',
};

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.m4v');
}

function resolveMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/uploads/')) return url;
  if (url.startsWith('uploads/')) return `/${url}`;
  return `/uploads/${url.replace(/^\/+/, '')}`;
}

export const FeedPage = () => {
  const [feedFilter, setFeedFilter] = useState<'all' | 'extra'>('all');

  const {
    data: publicFeedPages,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['verifications', 'public', feedFilter],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const nextTokenQuery = pageParam ? `&nextToken=${encodeURIComponent(pageParam)}` : '';
      const extraFilterQuery = feedFilter === 'extra' ? '&isExtra=true' : '';
      const response = await apiClient.get(`/verifications?isPublic=true&limit=20${extraFilterQuery}${nextTokenQuery}`);
      return response.data.data;
    },
    getNextPageParam: (lastPage) => lastPage?.nextToken || undefined,
  });

  const publicFeed = publicFeedPages?.pages?.flatMap((p: any) => p.verifications || []) || [];

  const cheerMutation = useMutation({
    mutationFn: async ({ receiverId, verificationId }: { receiverId: string; verificationId: string }) => {
      const response = await apiClient.post('/cheer/send-immediate', {
        receiverId,
        verificationId,
        message: '오늘도 수고했어요! 응원해요 💪',
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('응원을 보냈어요 💖');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '응원 발송에 실패했습니다');
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-2xl font-bold text-gray-900">어스 🌍</h1>
        <p className="text-sm text-gray-500">전 세계의 챌린저들과 함께해요</p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setFeedFilter('all')}
            className={`px-3 py-1.5 text-xs rounded-full border ${feedFilter === 'all' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setFeedFilter('extra')}
            className={`px-3 py-1.5 text-xs rounded-full border ${feedFilter === 'extra' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            📝 추가 기록만
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500">💡 {FILTER_GUIDE_TEXT[feedFilter]}</p>
      </div>

      <div className="px-6 py-6 space-y-4">
        <section className="bg-white border border-gray-200 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">인증 흐름 안내</h2>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• 일반 인증: 오늘의 핵심 실천 기록</li>
            <li>• 추가 기록: 같은 날 추가 실천(기본 나만보기 → 공개 전환 가능)</li>
            <li>• Day6 보완: 실패 Day를 다시 연결하는 회복 루트</li>
          </ul>
        </section>
        {isLoading ? (
          <Loading />
        ) : !publicFeed || publicFeed.length === 0 ? (
          <EmptyState
            icon="🌍"
            title={feedFilter === 'extra' ? '아직 공개된 추가 기록이 없어요' : '아직 공개된 인증이 없어요'}
            description={feedFilter === 'extra' ? '추가 인증을 공개 전환하면 여기에 표시돼요.' : '첫 번째로 인증을 올려보세요!'}
          />
) : (
          <>
          {publicFeed.map((verification: any, index: number) => (
            <motion.div
              key={verification.verificationId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-xl">
                  🐰
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {verification.isAnonymous ? '익명의 챌린저' : verification.userName}
                  </p>
                  <p className="text-sm text-gray-500">
                    Day {verification.day} · {format(new Date(verification.practiceAt || verification.performedAt || verification.createdAt), 'M월 d일 · HH:mm 실천', { locale: ko })}
                  </p>
                  {verification.isExtra && (
                    <span className="inline-flex items-center mt-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                      📝 추가 기록
                    </span>
                  )}
                </div>
              </div>

              {verification.imageUrl && (
                isVideoUrl(verification.imageUrl) ? (
                  <video
                    src={resolveMediaUrl(verification.imageUrl)}
                    controls
                    className="w-full h-56 object-cover rounded-2xl mb-4 bg-black"
                  />
                ) : (
                  <img
                    src={resolveMediaUrl(verification.imageUrl)}
                    alt="Verification"
                    className="w-full h-56 object-cover rounded-2xl mb-4"
                  />
                )
              )}

              {verification.todayNote && (
                <p className="text-gray-800 mb-4 leading-relaxed">{verification.todayNote}</p>
              )}

              <div className="flex items-center gap-4 text-sm text-gray-500">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => cheerMutation.mutate({
                    receiverId: verification.userId,
                    verificationId: verification.verificationId,
                  })}
                  disabled={cheerMutation.isPending}
                  className="flex items-center gap-1.5 hover:text-primary-500 transition-colors disabled:opacity-50"
                >
                  <FiHeart className="w-4 h-4" />
                  <span>{verification.cheerCount || 0}</span>
                </motion.button>
              </div>
            </motion.div>
          ))}

          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 disabled:opacity-50"
            >
              {isFetchingNextPage ? '불러오는 중...' : '피드 더보기'}
            </button>
          )}
          </>
        )}
      </div>
    </div>
  );
};
