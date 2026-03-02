import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowLeft, FiUsers, FiTrendingUp, FiClock, FiChevronRight, FiChevronLeft, FiList } from 'react-icons/fi';
import { Button } from '@/shared/components/Button';
import { Loading } from '@/shared/components/Loading';
import { BottomSheet } from '@/shared/components/BottomSheet';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────
// 위저드 스텝 타입
// ─────────────────────────────────────────────
type WizardStepKey = 'time' | 'goal' | 'quest' | 'confirm';

function getWizardSteps(challenge: any): WizardStepKey[] {
  const steps: WizardStepKey[] = ['time', 'goal'];
  if (challenge?.personalQuestEnabled) steps.push('quest');
  steps.push('confirm');
  return steps;
}

// ─────────────────────────────────────────────
// 시간 선택 옵션
// ─────────────────────────────────────────────
const MERIDIEM_OPTIONS: Array<{ value: 'AM' | 'PM'; label: string }> = [
  { value: 'AM', label: '오전' },
  { value: 'PM', label: '오후' },
];

const VERIFICATION_TYPE_OPTIONS: Array<{ value: 'image' | 'text' | 'link' | 'video'; label: string }> = [
  { value: 'image', label: '📸 사진' },
  { value: 'text', label: '✍️ 텍스트' },
  { value: 'link', label: '🔗 링크' },
  { value: 'video', label: '🎬 영상' },
];

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export const ChallengeDetailPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 참여 폼 상태
  const [hour12, setHour12] = useState(7);
  const [minute, setMinute] = useState(0);
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>('AM');
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  const [personalGoal, setPersonalGoal] = useState('');
  const [personalQuestTitle, setPersonalQuestTitle] = useState('');
  const [personalQuestDescription, setPersonalQuestDescription] = useState('');
  const [personalQuestVerificationType, setPersonalQuestVerificationType] = useState<'image' | 'text' | 'link' | 'video'>('image');

  // 위저드 UI 상태
  const [showJoinSheet, setShowJoinSheet] = useState(false);
  const [joinMode, setJoinMode] = useState<'wizard' | 'full'>('wizard');
  const [wizardStepIdx, setWizardStepIdx] = useState(0);
  const [slideDir, setSlideDir] = useState<1 | -1>(1); // 1=forward, -1=back

  // ─── 데이터 조회 ───────────────────────────
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

  const { data: myChallengesData } = useQuery({
    queryKey: ['my-challenges', 'active-on-detail'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=active');
      return response.data.data;
    },
  });

  // 챌린지 목표 시간으로 기본값 설정
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

  // ─── 참여 뮤테이션 ─────────────────────────
  const joinMutation = useMutation({
    mutationFn: async () => {
      // personalTarget은 항상 전송 (미입력 시 리더 설정 시간 사용)
      const payload: any = {
        personalGoal: personalGoal.trim() || undefined,
        personalTarget: {
          hour12,
          minute,
          meridiem,
          timezone: userTimezone,
        },
      };

      const response = await apiClient.post(`/challenges/${challengeId}/join`, payload);
      return response.data;
    },
    onSuccess: async (result) => {
      const userChallengeId = result?.data?.userChallengeId;
      if (challenge?.personalQuestEnabled && personalQuestTitle.trim() && userChallengeId) {
        try {
          await apiClient.post(`/challenges/${challengeId}/personal-quest`, {
            userChallengeId,
            title: personalQuestTitle.trim(),
            description: personalQuestDescription.trim(),
            verificationType: personalQuestVerificationType,
          });
        } catch (e: any) {
          toast.error(e?.response?.data?.message || '개인 퀘스트 제안 제출에 실패했습니다');
        }
      }
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      toast.success('챌린지 참여 완료! 오늘부터 시작하세요 🎉');
      setShowJoinSheet(false);
      navigate('/me');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '참여에 실패했습니다');
    },
  });

  // ─── 로딩 / 에러 처리 ─────────────────────
  if (isLoading) return <Loading fullScreen />;
  if (!challenge) return <div className="p-6 text-center text-gray-500">챌린지를 찾을 수 없습니다</div>;

  const lifecycle = String(challenge.lifecycle || 'draft');
  const alreadyJoined = (myChallengesData?.challenges ?? []).some(
    (item: any) => (item.challengeId ?? item.challenge?.challengeId) === challengeId,
  );
  const canJoin = lifecycle === 'recruiting' && !alreadyJoined;

  const ctaLabelMap: Record<string, string> = {
    recruiting: alreadyJoined ? '이미 참여신청한 챌린지' : '챌린지 참여 신청하기',
    preparing: '모집이 마감된 챌린지',
    active: '진행 중 (신규 참여 불가)',
    completed: '종료된 챌린지',
    archived: '보관된 챌린지',
    draft: '모집 전 챌린지',
  };
  const lifecycleHintMap: Record<string, string> = {
    recruiting: alreadyJoined ? '이미 참여신청을 완료한 챌린지입니다.' : '지금 참여 신청할 수 있습니다.',
    preparing: '모집이 종료되어 새로운 참여 신청은 불가능합니다.',
    active: '챌린지가 진행 중이라 신규 참여가 불가능합니다.',
    completed: '종료된 챌린지입니다.',
    archived: '보관된 챌린지입니다.',
    draft: '아직 공개되지 않은 챌린지입니다.',
  };

  // ─── 위저드 헬퍼 ───────────────────────────
  const wizardSteps = getWizardSteps(challenge);
  const currentStep = wizardSteps[wizardStepIdx];
  const totalSteps = wizardSteps.length;

  const openJoinSheet = () => {
    setWizardStepIdx(0);
    setJoinMode('wizard');
    setShowJoinSheet(true);
  };

  const closeJoinSheet = () => {
    setShowJoinSheet(false);
  };

  const goNext = () => {
    // 각 스텝별 유효성 검사
    if (currentStep === 'goal' && personalGoal.trim().length === 0) {
      toast.error('나의 목표를 입력해주세요');
      return;
    }
    if (wizardStepIdx < totalSteps - 1) {
      setSlideDir(1);
      setWizardStepIdx((i) => i + 1);
    }
  };

  const goPrev = () => {
    if (wizardStepIdx > 0) {
      setSlideDir(-1);
      setWizardStepIdx((i) => i - 1);
    }
  };

  const handleJoinSubmit = () => {
    if (personalGoal.trim().length === 0) {
      toast.error('나의 목표를 입력해주세요');
      if (joinMode === 'wizard') {
        const goalIdx = wizardSteps.indexOf('goal');
        if (goalIdx !== -1) {
          setSlideDir(-1);
          setWizardStepIdx(goalIdx);
        }
      }
      return;
    }
    joinMutation.mutate();
  };

  // ─── 위저드 스텝 콘텐츠 ─────────────────────
  const slideVariants = {
    enter: (dir: number) => ({ x: dir * 60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: -dir * 60, opacity: 0 }),
  };

  const renderWizardStep = (step: WizardStepKey) => {
    switch (step) {
      case 'time':
        return (
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xl font-bold text-gray-900">언제 이 챌린지를 실천할 건가요? ⏰</p>
              <p className="text-sm text-gray-500">
                매일 같은 시간에 습관을 만들면 효과가 더 좋아요.
                {challenge.targetTime && (
                  <span className="ml-1 text-primary-600 font-medium">
                    (리더 권장: {challenge.targetTime})
                  </span>
                )}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 text-center">오전/오후</label>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                  {MERIDIEM_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMeridiem(opt.value)}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${
                        meridiem === opt.value
                          ? 'bg-primary-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 text-center">시간</label>
                <select
                  value={hour12}
                  onChange={(e) => setHour12(Number(e.target.value))}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-center text-lg font-bold appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>{h}시</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 text-center">분</label>
                <select
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-center text-lg font-bold appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  {[0, 10, 20, 30, 40, 50].map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-3 text-sm text-primary-800">
              {meridiem === 'AM' ? '오전' : '오후'} {hour12}시 {String(minute).padStart(2, '0')}분에 실천할게요!
            </div>
          </div>
        );

      case 'goal':
        return (
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xl font-bold text-gray-900">나의 7일 목표를 적어주세요 🎯</p>
              <p className="text-sm text-gray-500">
                구체적인 목표일수록 포기하지 않을 수 있어요.
              </p>
            </div>
            <textarea
              value={personalGoal}
              onChange={(e) => setPersonalGoal(e.target.value)}
              placeholder="예: 매일 아침 30분씩 영어 공부하기, 일주일 동안 빠짐없이 운동하기..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              rows={4}
            />
            <p className="text-xs text-gray-400 text-right">{personalGoal.length}/200</p>
          </div>
        );

      case 'quest':
        return (
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xl font-bold text-gray-900">나만의 퀘스트를 등록할게요 📝</p>
              <p className="text-sm text-gray-500">
                {challenge?.personalQuestAutoApprove
                  ? '입력 즉시 자동 승인됩니다.'
                  : '리더가 검토 후 승인합니다.'}
                &nbsp;건너뛰면 공통 퀘스트로 참여합니다.
              </p>
            </div>

            <div className="space-y-3">
              <input
                value={personalQuestTitle}
                onChange={(e) => setPersonalQuestTitle(e.target.value)}
                placeholder="퀘스트 제목 (예: 매일 스쿼트 100개)"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <input
                value={personalQuestDescription}
                onChange={(e) => setPersonalQuestDescription(e.target.value)}
                placeholder="설명 (선택)"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">인증 방식</p>
                <div className="grid grid-cols-2 gap-2">
                  {VERIFICATION_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPersonalQuestVerificationType(opt.value)}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                        personalQuestVerificationType === opt.value
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'confirm':
        return (
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xl font-bold text-gray-900">참여 내용을 확인해주세요 ✅</p>
              <p className="text-sm text-gray-500">아래 내용으로 챌린지에 참여합니다.</p>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{challenge.badgeIcon || '🎯'}</span>
                  <div>
                    <p className="font-bold text-gray-900">{challenge.title}</p>
                    <p className="text-xs text-gray-500">{challenge.category} · {challenge.durationDays || 7}일 챌린지</p>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">실천 시간</span>
                    <span className="font-semibold text-gray-900">
                      {meridiem === 'AM' ? '오전' : '오후'} {hour12}시 {String(minute).padStart(2, '0')}분
                    </span>
                  </div>
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-gray-500 shrink-0">나의 목표</span>
                    <span className="font-medium text-gray-900 text-right text-xs">
                      {personalGoal.trim() || '(입력 없음)'}
                    </span>
                  </div>
                  {challenge.personalQuestEnabled && personalQuestTitle.trim() && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-gray-500 shrink-0">개인 퀘스트</span>
                      <span className="font-medium text-gray-900 text-right text-xs">{personalQuestTitle}</span>
                    </div>
                  )}
                </div>
              </div>

              {challenge.recruitingEndAt && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  모집 마감: {String(challenge.recruitingEndAt).replace('T', ' ').slice(0, 16)}
                </p>
              )}
            </div>
          </div>
        );
    }
  };

  // ─── BottomSheet 내부 렌더 ─────────────────
  const renderJoinSheetContent = () => {
    // ── 전체 입력 모드 ──────────────────────
    if (joinMode === 'full') {
      return (
        <div className="px-6 pb-8 space-y-6">
          {/* 실천 시간 */}
          <div className="space-y-3">
            <p className="text-base font-bold text-gray-900">실천 시간 ⏰</p>
            <p className="text-xs text-gray-500">
              미입력 시 리더 설정 시간({challenge.targetTime || '-'})으로 자동 적용됩니다.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex rounded-xl border border-gray-200 overflow-hidden col-span-1">
                {MERIDIEM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMeridiem(opt.value)}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                      meridiem === opt.value
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <select
                value={hour12}
                onChange={(e) => setHour12(Number(e.target.value))}
                className="px-2 py-2.5 border border-gray-200 rounded-xl text-center font-bold"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>{h}시</option>
                ))}
              </select>
              <select
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
                className="px-2 py-2.5 border border-gray-200 rounded-xl text-center font-bold"
              >
                {[0, 10, 20, 30, 40, 50].map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
                ))}
              </select>
            </div>
          </div>

          {/* 나의 목표 */}
          <div className="space-y-2">
            <p className="text-base font-bold text-gray-900">나의 목표 🎯 <span className="text-red-500 text-sm">*</span></p>
            <textarea
              value={personalGoal}
              onChange={(e) => setPersonalGoal(e.target.value)}
              placeholder="7일 동안 달성하고 싶은 나만의 목표를 적어주세요"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              rows={3}
            />
          </div>

          {/* 개인 퀘스트 (선택) */}
          {challenge.personalQuestEnabled && (
            <div className="space-y-2">
              <p className="text-base font-bold text-gray-900">개인 퀘스트 📝 <span className="text-xs text-gray-400 font-normal">(선택)</span></p>
              <input
                value={personalQuestTitle}
                onChange={(e) => setPersonalQuestTitle(e.target.value)}
                placeholder="퀘스트 제목"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <input
                value={personalQuestDescription}
                onChange={(e) => setPersonalQuestDescription(e.target.value)}
                placeholder="설명 (선택)"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="flex gap-2">
                {VERIFICATION_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPersonalQuestVerificationType(opt.value)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      personalQuestVerificationType === opt.value
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            fullWidth
            size="lg"
            onClick={handleJoinSubmit}
            loading={joinMutation.isPending}
          >
            참여 신청하기 🚀
          </Button>
        </div>
      );
    }

    // ── 위저드 모드 ────────────────────────
    const progressPct = ((wizardStepIdx + 1) / totalSteps) * 100;
    const isLastStep = wizardStepIdx === totalSteps - 1;

    return (
      <div className="px-6 pb-8">
        {/* 진행 바 */}
        <div className="h-1 bg-gray-100 rounded-full mb-6">
          <motion.div
            className="h-full bg-primary-500 rounded-full"
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* 스텝 카운트 */}
        <p className="text-xs text-gray-400 mb-4">{wizardStepIdx + 1} / {totalSteps}</p>

        {/* 스텝 콘텐츠 - 슬라이드 애니메이션 */}
        <div className="overflow-hidden min-h-[240px]">
          <AnimatePresence mode="wait" custom={slideDir}>
            <motion.div
              key={wizardStepIdx}
              custom={slideDir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              {renderWizardStep(currentStep)}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 네비게이션 버튼 */}
        <div className="mt-8 flex items-center gap-3">
          {wizardStepIdx > 0 && (
            <button
              type="button"
              onClick={goPrev}
              className="w-12 h-12 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <FiChevronLeft className="w-5 h-5" />
            </button>
          )}

          {isLastStep ? (
            <Button
              fullWidth
              size="lg"
              onClick={handleJoinSubmit}
              loading={joinMutation.isPending}
            >
              참여 신청하기 🚀
            </Button>
          ) : (
            <>
              {currentStep === 'quest' && (
                <button
                  type="button"
                  onClick={() => {
                    setSlideDir(1);
                    setWizardStepIdx((i) => i + 1);
                  }}
                  className="px-4 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors"
                >
                  건너뛰기
                </button>
              )}
              <Button fullWidth size="lg" onClick={goNext}>
                다음 <FiChevronRight className="inline w-4 h-4 ml-1" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  // ─── 페이지 렌더 ───────────────────────────
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

      <div className="p-6 space-y-6">
        {/* 챌린지 기본 정보 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
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
                권장 시간: {challenge.targetTime}
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
                  <span className="text-sm font-medium text-gray-600 w-12">Day {day.day}</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all"
                      style={{ width: `${day.completionRate}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 w-12 text-right">{Math.round(day.completionRate)}%</span>
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
          className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl p-6 border border-primary-200"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-3">완주 시 획득 뱃지</h3>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-sm">
              {challenge.badgeIcon || '🏆'}
            </div>
            <div>
              <p className="font-bold text-gray-900">{challenge.badgeName}</p>
              <p className="text-sm text-gray-600">"나는 {challenge.identityKeyword} 사람"</p>
            </div>
          </div>
        </motion.div>

        {/* 상태 안내 */}
        <p className="text-sm text-gray-500 text-center">
          {lifecycleHintMap[lifecycle] ?? '참여 가능 상태를 확인해주세요.'}
        </p>
      </div>

      {/* 하단 고정 참여 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-3 bg-white border-t border-gray-100 z-30">
        <Button
          fullWidth
          size="lg"
          onClick={openJoinSheet}
          disabled={!canJoin || alreadyJoined}
        >
          {ctaLabelMap[lifecycle] ?? '챌린지 참여하기'}
        </Button>
      </div>

      {/* ─── 참여 BottomSheet ─────────────────── */}
      <BottomSheet
        isOpen={showJoinSheet}
        onClose={closeJoinSheet}
        title={undefined}
        maxHeight="92vh"
      >
        <div>
          {/* 시트 헤더: 챌린지명 + 모드 토글 */}
          <div className="px-6 pt-2 pb-4 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xl">{challenge.badgeIcon || '🎯'}</span>
              <p className="font-bold text-gray-900 text-sm truncate max-w-[160px]">{challenge.title}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setJoinMode((m) => (m === 'wizard' ? 'full' : 'wizard'));
                if (joinMode === 'full') setWizardStepIdx(0);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <FiList className="w-3.5 h-3.5" />
              {joinMode === 'wizard' ? '전체 입력' : '단계별 입력'}
            </button>
          </div>

          {renderJoinSheetContent()}
        </div>
      </BottomSheet>
    </div>
  );
};
