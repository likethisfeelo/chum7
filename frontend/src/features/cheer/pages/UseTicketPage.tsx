import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiHeart } from 'react-icons/fi';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import toast from 'react-hot-toast';

const CHEER_MESSAGES = [
  '오늘도 수고했어요! 응원해요 💪',
  '포기하지 마세요! 할 수 있어요 🔥',
  '당신의 노력이 빛나고 있어요 ✨',
  '같이 해서 더 즐거워요 😊',
  '내일도 화이팅! 🌟',
];

export const UseTicketPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [selectedMessage, setSelectedMessage] = useState(CHEER_MESSAGES[0]);

  const { data: targets, isLoading } = useQuery({
    queryKey: ['cheer-targets'],
    queryFn: async () => {
      const response = await apiClient.get('/cheer/targets');
      return response.data.data.targets;
    },
  });

  const useTicketMutation = useMutation({
    mutationFn: async ({ ticketId, receiverId }: { ticketId: string; receiverId: string }) => {
      const response = await apiClient.post('/cheer/use-ticket', {
        ticketId,
        receiverId,
        message: selectedMessage,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheer-targets'] });
      toast.success('응원권을 사용했어요! 💌');
      navigate('/me');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '응원권 사용에 실패했습니다');
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">응원권 사용하기 🎟</h1>
      </div>

      <div className="p-6 space-y-6">
        {/* 응원 메시지 선택 */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-3">응원 메시지 선택</h2>
          <div className="space-y-2">
            {CHEER_MESSAGES.map((msg) => (
              <button
                key={msg}
                onClick={() => setSelectedMessage(msg)}
                className={`w-full py-3 px-4 rounded-xl text-left text-sm font-medium transition-all ${
                  selectedMessage === msg
                    ? 'bg-primary-50 border-2 border-primary-400 text-primary-700'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {msg}
              </button>
            ))}
          </div>
        </div>

        {/* 응원 대상 선택 */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-3">응원 대상 선택</h2>
          {isLoading ? (
            <Loading />
          ) : !targets || targets.length === 0 ? (
            <EmptyState
              icon="💭"
              title="응원할 수 있는 사람이 없어요"
              description="아직 같이 챌린지하는 사람이 없어요"
            />
          ) : (
            <div className="space-y-3">
              {targets.map((target: any) => (
                <motion.button
                  key={target.userId}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedTarget(target)}
                  className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedTarget?.userId === target.userId
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center text-2xl">
                      {target.animalIcon || '🐰'}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{target.name}</p>
                      <p className="text-sm text-gray-500">
                        Day {target.currentDay} 진행 중
                      </p>
                    </div>
                    {selectedTarget?.userId === target.userId && (
                      <FiHeart className="w-5 h-5 text-primary-500" />
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* 응원 보내기 버튼 */}
        {selectedTarget && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => useTicketMutation.mutate({
              ticketId: targets?.[0]?.ticketId || '',
              receiverId: selectedTarget.userId,
            })}
            disabled={useTicketMutation.isPending}
            className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold text-lg rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
          >
            {useTicketMutation.isPending ? '전송 중...' : `${selectedTarget.name}님께 응원 보내기 💖`}
          </motion.button>
        )}
      </div>
    </div>
  );
};
