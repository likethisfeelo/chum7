import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';

export const TodayPage = () => {
  const queryClient = useQueryClient();

  const { data: cheers, isLoading: cheersLoading } = useQuery({
    queryKey: ['my-cheers'],
    queryFn: async () => {
      const response = await apiClient.get('/cheer/my-cheers?limit=20');
      return response.data.data.cheers;
    },
  });

  const thankMutation = useMutation({
    mutationFn: async (cheerId: string) => {
      const response = await apiClient.post('/cheer/thank', { cheerId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cheers'] });
      toast.success('감사 표현을 보냈어요 💖');
    },
    onError: () => {
      toast.error('이미 감사 표현을 했거나 오류가 발생했습니다');
    },
  });

  const today = format(new Date(), 'M월 d일 (E)', { locale: ko });
  const unreadCheers = cheers?.filter((c: any) => !c.isRead) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-2xl font-bold text-gray-900">투데이 📊</h1>
        <p className="text-sm text-gray-500">{today}</p>
      </div>

      <div className="p-6 space-y-6">
        {/* 받은 응원 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">받은 응원 💌</h2>
            {unreadCheers.length > 0 && (
              <span className="px-2 py-0.5 bg-primary-100 text-primary-600 text-xs font-bold rounded-full">
                새 응원 {unreadCheers.length}개
              </span>
            )}
          </div>

          {cheersLoading ? (
            <Loading />
          ) : !cheers || cheers.length === 0 ? (
            <EmptyState
              icon="💌"
              title="아직 받은 응원이 없어요"
              description="인증을 올리면 다른 챌린저들이 응원을 보내줄 거예요"
            />
          ) : (
            <div className="space-y-3">
              {cheers.map((cheer: any, index: number) => (
                <motion.div
                  key={cheer.cheerId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-white rounded-2xl p-5 shadow-sm border ${!cheer.isRead ? 'border-primary-200' : 'border-gray-100'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">
                        💖
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 mb-1">
                          익명의 응원자
                        </p>
                        <p className="text-gray-700 text-sm leading-relaxed">
                          {cheer.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          {format(new Date(cheer.createdAt || cheer.sentAt), 'MM/dd HH:mm', { locale: ko })}
                        </p>
                      </div>
                    </div>
                    {!cheer.isThanked && (
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => thankMutation.mutate(cheer.cheerId)}
                        disabled={thankMutation.isPending}
                        className="flex-shrink-0 px-3 py-2 bg-primary-50 text-primary-600 text-xs font-semibold rounded-xl hover:bg-primary-100 transition-colors disabled:opacity-50"
                      >
                        감사 💝
                      </motion.button>
                    )}
                    {cheer.isThanked && (
                      <span className="flex-shrink-0 px-3 py-2 bg-gray-50 text-gray-400 text-xs rounded-xl">
                        감사 완료
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
