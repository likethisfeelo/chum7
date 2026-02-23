import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiHeart } from 'react-icons/fi';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import toast from 'react-hot-toast';

export const FeedPage = () => {
  const { data: publicFeed, isLoading } = useQuery({
    queryKey: ['verifications', 'public'],
    queryFn: async () => {
      const response = await apiClient.get('/verifications?isPublic=true&limit=20');
      return response.data.data.verifications;
    },
  });

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
      </div>

      <div className="px-6 py-6 space-y-4">
        {isLoading ? (
          <Loading />
        ) : !publicFeed || publicFeed.length === 0 ? (
          <EmptyState
            icon="🌍"
            title="아직 공개된 인증이 없어요"
            description="첫 번째로 인증을 올려보세요!"
          />
        ) : (
          publicFeed.map((verification: any, index: number) => (
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
                    Day {verification.day} · {format(new Date(verification.createdAt), 'HH:mm', { locale: ko })}
                  </p>
                </div>
              </div>

              {verification.imageUrl && (
                <img
                  src={verification.imageUrl}
                  alt="Verification"
                  className="w-full h-56 object-cover rounded-2xl mb-4"
                />
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
          ))
        )}
      </div>
    </div>
  );
};
