import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import { Button } from '@/shared/components/Button';
import { Textarea } from '@/shared/components/Textarea';
import { Loading } from '@/shared/components/Loading';
import toast from 'react-hot-toast';
import { getRemainingRemedyCount, getRemedyType } from '@/features/challenge/utils/flowPolicy';
import { haptic } from '@/shared/utils/haptics';

export const RemedyPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userChallengeId = searchParams.get('userChallengeId');
  const dayFromQuery = searchParams.get('day');
  const queryClient = useQueryClient();

  const [selectedDay, setSelectedDay] = useState<number>(Number(dayFromQuery || 0));
  // 입력 부담 최소화 — 오늘의 실천만 필수 (회고·다짐 필드 제거)
  const [formData, setFormData] = useState({
    todayNote: '',
    practiceAt: new Date().toISOString().slice(0, 16),
  });

  const { data: myChallengesData, isLoading: isLoadingChallenges } = useQuery({
    queryKey: ['my-challenges', 'remedy-page'],
    queryFn: async () => {
      const response = await apiClient.get('/c/challenges/my?status=active');
      return response.data.data;
    },
  });

  const currentChallenge = useMemo(
    () => (myChallengesData?.challenges || []).find((item: any) => item.userChallengeId === userChallengeId),
    [myChallengesData?.challenges, userChallengeId],
  );

  // 지나간 날짜 중 미완료·미보완분 (레거시 7일 기준 p.day<=5 하드코딩 제거 — 기간 가변 대응)
  const currentDay = Number(currentChallenge?.currentDay || 0);
  const failedDays = useMemo(
    () =>
      (currentChallenge?.progress || []).filter(
        (p: any) => p.status !== 'success' && !p.remedied && (currentDay <= 0 || p.day < currentDay),
      ),
    [currentChallenge?.progress, currentDay],
  );

  const remainingRemedy = getRemainingRemedyCount(currentChallenge?.remedyPolicy, currentChallenge?.progress || []);
  const remedyType = getRemedyType(currentChallenge?.remedyPolicy);
  const canSubmitRemedy = remedyType !== 'disabled' && (remainingRemedy === null || remainingRemedy > 0);

  const remedyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiClient.post('/c/verifications/remedy', data);
      return response.data;
    },
    onSuccess: (data) => {
      haptic('success'); // 지원 기기(Android·앱 셸)에서 완료 진동
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      const remaining = data?.data?.remainingRemedyDays;
      if (remaining !== undefined && remaining !== null) {
        toast.success(`${data.message || '보완 인증 완료! 💪'} · 남은 보완 ${remaining}회`);
      } else {
        toast.success(data.message || '보완 인증 완료! 💪');
      }
      navigate('/me');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '보완 인증에 실패했습니다');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDay) {
      toast.error('보완할 Day를 선택해주세요');
      return;
    }

    if (!formData.todayNote.trim()) {
      toast.error('오늘의 실천을 작성해주세요');
      return;
    }

    remedyMutation.mutate({
      userChallengeId,
      originalDay: selectedDay,
      todayNote: formData.todayNote.trim(),
      practiceAt: new Date(formData.practiceAt).toISOString(),
    });
  };

  if (isLoadingChallenges) {
    return <Loading fullScreen />;
  }

  if (!currentChallenge) {
    return (
      <div className="min-h-screen p-6 text-center text-gray-600">
        <p>유효한 챌린지 참여 정보를 찾을 수 없습니다.</p>
        <button onClick={() => navigate('/me')} className="mt-4 px-4 py-2 rounded-xl bg-primary-600 text-white">ME로 이동</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 glass-header px-6 py-4 flex items-center gap-4 z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">보완 인증하기</h1>
          {/* 여러 챌린지 동시 진행 시 어떤 챌린지의 보완인지 명시 */}
          <p className="text-xs text-gray-500 truncate">
            {currentChallenge.challenge?.badgeIcon || '🎯'} {currentChallenge.challenge?.title || '챌린지'}
          </p>
        </div>
      </div>

      <div className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200 mb-6"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
              <FiRefreshCw className="w-6 h-6 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-purple-500 truncate">
                {currentChallenge.challenge?.badgeIcon || '🎯'} {currentChallenge.challenge?.title || '챌린지'}
              </p>
              <h3 className="font-bold text-purple-900 mb-1">보완 기회</h3>
              <p className="text-sm text-purple-700">놓친 Day를 정책 범위 내에서 복구할 수 있어요.</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-purple-700">
            <p>정책: <span className="font-semibold">{remedyType}</span></p>
            <p>남은 보완 횟수: <span className="font-semibold">{remainingRemedy === null ? '제한 없음' : `${remainingRemedy}회`}</span></p>
            <p>보완 점수: 기본 점수의 70%</p>
          </div>
        </motion.div>

        {!canSubmitRemedy && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-4">
            현재 정책에서는 보완 인증을 진행할 수 없습니다.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">보완할 Day 선택</label>
            <div className="flex flex-wrap gap-2">
              {failedDays.map((day: any) => (
                <button
                  key={day.day}
                  type="button"
                  onClick={() => setSelectedDay(day.day)}
                  className={`px-3 py-2 rounded-lg text-sm border ${selectedDay === day.day ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200'}`}
                >
                  Day {day.day}
                </button>
              ))}
            </div>
            {failedDays.length === 0 && <p className="text-xs text-gray-500 mt-2">보완 가능한 실패 Day가 없습니다.</p>}
          </div>

          <Textarea
            label="오늘의 실천 ✨"
            value={formData.todayNote}
            onChange={(e) => setFormData({ ...formData, todayNote: e.target.value })}
            placeholder="오늘은 어떻게 다시 실천했나요?"
            rows={4}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">실천 시각 (내 로컬 시간) ⏰</label>
            <input
              type="datetime-local"
              value={formData.practiceAt}
              onChange={(e) => setFormData({ ...formData, practiceAt: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">현재 시각 기준 4시간 이내만 제출할 수 있어요.</p>
          </div>

          <Button type="submit" fullWidth size="lg" loading={remedyMutation.isPending} disabled={!canSubmitRemedy || failedDays.length === 0}>
            다시 연결하기 ✨
          </Button>
        </form>

        {remedyType === 'last_day' && (
          <p className="text-xs text-gray-500 text-center mt-4">💡 이 챌린지는 마지막 날에만 보완할 수 있어요</p>
        )}
      </div>
    </div>
  );
};
