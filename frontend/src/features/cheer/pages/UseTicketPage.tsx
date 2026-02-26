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
  const [selectedMessage, setSelectedMessage] = useState(CHEER_MESSAGES[0]);

  const { data, isLoading } = useQuery({
    queryKey: ['cheer-targets'],
    queryFn: async () => {
      const response = await apiClient.get('/cheer/targets');
      return response.data.data;
    },
  });

  const firstTicket = data?.availableTickets?.[0];
  const immediateTargets = data?.immediateTargets || [];

  const useTicketMutation = useMutation({
    mutationFn: async ({ ticketId }: { ticketId: string }) => {
      const response = await apiClient.post('/cheer/use-ticket', {
        ticketId,
        message: selectedMessage,
      });
      return response.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['cheer-targets'] });
      toast.success(res?.message || '응원권을 사용했어요! 💌');
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
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">보유 응원권: <span className="font-bold text-gray-900">{data?.myTickets || 0}</span>장</p>
          <p className="text-sm text-gray-600 mt-1">즉시 응원 대상(미완료): <span className="font-bold text-gray-900">{immediateTargets.length}</span>명</p>
        </div>

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

        <div>
          <h2 className="text-base font-bold text-gray-900 mb-3">발송 방식</h2>
          {isLoading ? (
            <Loading />
          ) : (!data || data.myTickets === 0) ? (
            <EmptyState
              icon="🎟"
              title="사용 가능한 응원권이 없어요"
              description="인증을 먼저 완료하고 응원권을 획득해보세요"
            />
          ) : immediateTargets.length === 0 ? (
            <EmptyState
              icon="💭"
              title="응원할 미완료 참여자가 없어요"
              description="지금은 발송 가능한 대상이 없습니다"
            />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-gray-700 mb-2">
                <FiHeart className="w-4 h-4 text-primary-500" />
                <p className="text-sm">응원권 1장으로 같은 챌린지 미완료 참여자 전원에게 익명 즉시 발송</p>
              </div>
              <p className="text-xs text-gray-500">대상 수: {immediateTargets.length}명</p>
            </div>
          )}
        </div>

        {firstTicket && immediateTargets.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => useTicketMutation.mutate({ ticketId: firstTicket.ticketId })}
            disabled={useTicketMutation.isPending}
            className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold text-lg rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
          >
            {useTicketMutation.isPending ? '발송 중...' : `응원 ${immediateTargets.length}명에게 보내기 💖`}
          </motion.button>
        )}
      </div>
    </div>
  );
};
