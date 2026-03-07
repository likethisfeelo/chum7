import { useMemo, useState } from 'react';
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

type ChallengeFilter = 'all' | string;

type ChallengeOption = {
  challengeId: string;
  label: string;
};

export const UseTicketPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedMessage, setSelectedMessage] = useState(CHEER_MESSAGES[0]);
  const [challengeFilter, setChallengeFilter] = useState<ChallengeFilter>('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['cheer-targets'],
    queryFn: async () => {
      const response = await apiClient.get('/cheer/targets');
      return response.data.data;
    },
    retry: false,
  });

  const immediateTargets = data?.immediateTargets || [];
  const availableTickets = data?.availableTickets || [];

  const challengeOptions = useMemo(() => {
    const map = new Map<string, ChallengeOption>();

    immediateTargets.forEach((target: any) => {
      if (!target.challengeId) return;
      if (!map.has(target.challengeId)) {
        map.set(target.challengeId, {
          challengeId: target.challengeId,
          label: target.challengeTitle || `챌린지 ${String(target.challengeId).slice(0, 8)}`,
        });
      }
    });

    availableTickets.forEach((ticket: any) => {
      if (!ticket.challengeId) return;
      if (!map.has(ticket.challengeId)) {
        map.set(ticket.challengeId, {
          challengeId: ticket.challengeId,
          label: `챌린지 ${String(ticket.challengeId).slice(0, 8)}`,
        });
      }
    });

    return Array.from(map.values());
  }, [availableTickets, immediateTargets]);

  const filteredTickets = useMemo(() => {
    if (challengeFilter === 'all') return availableTickets;
    return availableTickets.filter((ticket: any) => ticket.challengeId === challengeFilter);
  }, [availableTickets, challengeFilter]);

  const filteredTargets = useMemo(() => {
    if (challengeFilter === 'all') return immediateTargets;
    return immediateTargets.filter((target: any) => target.challengeId === challengeFilter);
  }, [challengeFilter, immediateTargets]);

  const selectedTicket = challengeFilter === 'all'
    ? (filteredTickets[0] || availableTickets[0] || null)
    : (filteredTickets[0] || null);

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
      const remaining = (data?.myTickets ?? 1) - 1;
      toast.success(`응원을 보냈어요! 💌 잔여 응원권: ${remaining}장`);
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
          <h2 className="text-base font-bold text-gray-900 mb-3">챌린지 선택</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setChallengeFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs border ${challengeFilter === 'all' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              전체
            </button>
            {challengeOptions.map((option) => (
              <button
                key={option.challengeId}
                type="button"
                onClick={() => setChallengeFilter(option.challengeId)}
                className={`px-3 py-1.5 rounded-full text-xs border ${challengeFilter === option.challengeId ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-300'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
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
          ) : isError ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
              <p className="text-sm text-amber-800">응원 대상 조회에 실패했어요. 잠시 후 다시 시도해주세요.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white"
              >
                다시 조회
              </button>
            </div>
          ) : (!data || data.myTickets === 0) ? (
            <EmptyState
              icon="🎟"
              title="사용 가능한 응원권이 없어요"
              description="인증을 먼저 완료하고 응원권을 획득해보세요"
            />
          ) : filteredTickets.length === 0 ? (
            <EmptyState
              icon="🎟"
              title="선택한 챌린지에 사용할 응원권이 없어요"
              description="다른 챌린지를 선택하거나 인증으로 응원권을 획득해보세요"
            />
          ) : filteredTargets.length === 0 ? (
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
              <p className="text-xs text-gray-500">대상 수: {filteredTargets.length}명</p>
              <p className="text-xs text-gray-500 mt-1">선택된 챌린지 응원권: {filteredTickets.length}장</p>
            </div>
          )}
        </div>

        {selectedTicket && filteredTargets.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => useTicketMutation.mutate({ ticketId: selectedTicket.ticketId })}
            disabled={useTicketMutation.isPending}
            className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold text-lg rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
          >
            {useTicketMutation.isPending ? '발송 중...' : `응원 ${filteredTargets.length}명에게 보내기 💖`}
          </motion.button>
        )}
      </div>
    </div>
  );
};
