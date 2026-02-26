import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiUsers, FiTrendingUp, FiClock } from 'react-icons/fi';
import { Button } from '@/shared/components/Button';
import { Loading } from '@/shared/components/Loading';
import toast from 'react-hot-toast';

export const ChallengeDetailPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [personalGoal, setPersonalGoal] = useState('');
  const [hour12, setHour12] = useState(7);
  const [minute, setMinute] = useState(0);
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>('AM');


  const { data: challenge, isLoading } = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: async () => {
      const response = await apiClient.get(`/challenges/${challengeId}`);
      return response.data.data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['challenge-stats', challengeId],
    queryFn: async () => {
      const response = await apiClient.get(`/challenges/${challengeId}/stats`);
      return response.data.data.stats;
    },
  });

  useEffect(() => {
    if (!challenge?.targetTime) return;
    const [hh, mm] = String(challenge.targetTime).split(':').map((v: string) => Number(v));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    const isPm = hh >= 12;
    const nextHour = hh % 12 === 0 ? 12 : hh % 12;
    setHour12(nextHour);
    setMinute(mm);
    setMeridiem(isPm ? 'PM' : 'AM');
  }, [challenge?.targetTime]);

  const joinMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/challenges/${challengeId}/join`, {
        personalGoal: personalGoal.trim() || undefined,
        personalTarget: {
          hour12,
          minute,
          meridiem,
          timezone: 'Asia/Seoul',
        },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      toast.success('챌린지 참여 완료! 오늘부터 시작하세요 🎉');
      navigate('/me');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '참여에 실패했습니다');
    },
  });

  if (isLoading) return <Loading fullScreen />;
  if (!challenge) return <div className="p-6 text-center text-gray-500">챌린지를 찾을 수 없습니다</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 헤더 */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">챌린지 상세</h1>
      </div>

      <div className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl flex items-center justify-center text-4xl">
              {challenge.badgeIcon || '🎯'}
            </div>
            <div className="flex-1">
              <span className="inline-block px-3 py-1 bg-primary-100 text-primary-700 text-xs font-medium rounded-full mb-2">
                {challenge.category}
              </span>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {challenge.title}
              </h2>
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <FiClock className="w-4 h-4" />
                목표 시간: {challenge.targetTime}
              </p>
            </div>
          </div>

          <p className="text-gray-700 leading-relaxed mb-6">
            {challenge.description}
          </p>

          {/* 통계 */}
          {stats && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <FiUsers className="w-5 h-5 mx-auto mb-2 text-gray-600" />
                <p className="text-2xl font-bold text-gray-900">{stats.totalParticipants}</p>
                <p className="text-xs text-gray-600">참여자</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <FiTrendingUp className="w-5 h-5 mx-auto mb-2 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{stats.completionRate}%</p>
                <p className="text-xs text-gray-600">완료율</p>
              </div>
              <div className="text-center p-4 bg-primary-50 rounded-xl">
                <span className="block text-2xl mb-1">⭐</span>
                <p className="text-2xl font-bold text-gray-900">{stats.averageScore}</p>
                <p className="text-xs text-gray-600">평균 점수</p>
              </div>
            </div>
          )}

          {/* Day별 완료율 */}
          {stats?.dayCompletionRates && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">Day별 완료율</p>
              {stats.dayCompletionRates.map((day: any) => (
                <div key={day.day} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-600 w-12">
                    Day {day.day}
                  </span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all"
                      style={{ width: `${day.completionRate}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 w-12 text-right">
                    {Math.round(day.completionRate)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* 획득 뱃지 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl p-6 border border-primary-200 mb-6"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-3">획득 뱃지</h3>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-sm">
              {challenge.badgeIcon || '🏆'}
            </div>
            <div>
              <p className="font-bold text-gray-900">{challenge.badgeName}</p>
              <p className="text-sm text-gray-600">
                "나는 {challenge.identityKeyword} 사람"
              </p>
            </div>
          </div>
        </motion.div>


        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h3 className="text-base font-bold text-gray-900 mb-3">내 목표 시간 설정</h3>
          <p className="text-sm text-gray-500 mb-4">참여 후 preparing 단계에서 사용할 개인 목표시간입니다 (KST).</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <select value={hour12} onChange={(e) => setHour12(Number(e.target.value))} className="px-3 py-2.5 border border-gray-300 rounded-xl">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>{h}시</option>
              ))}
            </select>
            <select value={minute} onChange={(e) => setMinute(Number(e.target.value))} className="px-3 py-2.5 border border-gray-300 rounded-xl">
              {[0, 10, 20, 30, 40, 50].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
              ))}
            </select>
            <select value={meridiem} onChange={(e) => setMeridiem(e.target.value as 'AM' | 'PM')} className="px-3 py-2.5 border border-gray-300 rounded-xl">
              <option value="AM">오전</option>
              <option value="PM">오후</option>
            </select>
          </div>
          <input
            value={personalGoal}
            onChange={(e) => setPersonalGoal(e.target.value)}
            placeholder="개인 목표 메모 (선택)"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl"
          />
        </div>

        {/* 참여 버튼 */}
        <Button
          fullWidth
          size="lg"
          onClick={() => joinMutation.mutate()}
          loading={joinMutation.isPending}
        >
          챌린지 시작하기 🚀
        </Button>

        <p className="text-xs text-gray-500 text-center mt-4">
          💡 오늘부터 7일간 진행됩니다
        </p>
      </div>
    </div>
  );
};
