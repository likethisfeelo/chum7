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
import { getRemainingRemedyCount, getRemedyLabel, getRemedyType } from '@/features/challenge/utils/flowPolicy';
import { haptic } from '@/shared/utils/haptics';
import {
  computeTodayChallengeDay,
  durationDaysOf,
  missedDaysOf,
  remedyPolicyOf,
} from '@/features/challenge/utils/remedyStatus';

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
      // status=all — 종료 유예(마지막 날 보완) 중인 참여도 조회되어야 한다
      const response = await apiClient.get('/c/challenges/my?status=all');
      return response.data.data;
    },
  });

  const currentChallenge = useMemo(
    () => (myChallengesData?.challenges || []).find((item: any) => item.userChallengeId === userChallengeId),
    [myChallengesData?.challenges, userChallengeId],
  );

  // 지나간 날짜 중 미완료·미보완분 — 서버 저장 currentDay는 갱신 지연이 있어
  // 시작일 기준 KST 달력 계산(missedDaysOf)을 쓴다 (진행현황 그리드와 동일 기준)
  const failedDays = useMemo(() => {
    const days = new Set(missedDaysOf(currentChallenge));
    return (currentChallenge?.progress || []).filter((p: any) => days.has(Number(p.day)));
  }, [currentChallenge]);

  // 정책은 참여 레코드가 아닌 챌린지 META에서 폴백 해석 (참여 레벨 값은 대부분 null)
  const remedyPolicy = remedyPolicyOf(currentChallenge);
  const remainingRemedy = getRemainingRemedyCount(remedyPolicy, currentChallenge?.progress || []);
  const remedyType = getRemedyType(remedyPolicy);
  const durationDays = durationDaysOf(currentChallenge);
  const todayDay = currentChallenge ? computeTodayChallengeDay(currentChallenge) : 1;
  // last_day 정책은 마지막 날에만 서버 창이 열린다 — 미리 막아 헛제출을 방지
  const lastDayLocked = remedyType === 'last_day' && todayDay !== durationDays;
  const canSubmitRemedy =
    remedyType !== 'disabled' && !lastDayLocked && (remainingRemedy === null || remainingRemedy > 0);

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

  // 종료된 챌린지는 보완 불가 — 기간이 끝나면 점수·완주가 확정된다 (서버도 동일하게 막는다)
  if (computeTodayChallengeDay(currentChallenge) > durationDays) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl mb-3">🏁</p>
        <p className="text-base font-semibold text-gray-800">이미 종료된 챌린지예요</p>
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
          보완은 챌린지가 진행 중일 때만 할 수 있어요.
          <br />
          다음 챌린지에서 다시 이어가요.
        </p>
        <button
          onClick={() => navigate('/me')}
          className="mt-6 px-5 py-2.5 rounded-full bg-primary-600 text-white text-sm font-semibold"
        >
          내 챌린지로
        </button>
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
              <p className="text-sm text-purple-700">
                {remedyType === 'last_day'
                  ? `마지막 날(Day ${durationDays})에 지난 인증을 한 번에 복구할 수 있어요.`
                  : '지나간 날 중 놓친 인증을 언제든 복구할 수 있어요.'}
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-purple-700">
            <p>정책: <span className="font-semibold">{getRemedyLabel(remedyPolicy)}</span></p>
            <p>남은 보완 횟수: <span className="font-semibold">{remainingRemedy === null ? '제한 없음' : `${remainingRemedy}회`}</span></p>
            <p>보완 점수: 기본 점수의 70%</p>
          </div>
        </motion.div>

        {!canSubmitRemedy && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-4">
            {lastDayLocked
              ? `이 챌린지는 마지막 날(Day ${durationDays})에 보완 창이 열려요. 오늘은 Day ${todayDay} — 오늘의 인증에 집중해요!`
              : '현재 정책에서는 보완 인증을 진행할 수 없습니다.'}
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
          <p className="text-xs text-gray-500 text-center mt-4">
            💡 이 챌린지는 마지막 날(Day {durationDays})에만 보완할 수 있어요
          </p>
        )}
      </div>
    </div>
  );
};
