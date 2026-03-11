import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '@/shared/components/BottomSheet';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { JoinWizardChallenge, QuestVerificationType, WizardFormState } from './join-wizard/types';
import { resolveWizardSteps } from './join-wizard/resolveWizardSteps';
import { resolveJoinRequirements } from './join-wizard/requirements';

interface JoinWizardBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  challenge: JoinWizardChallenge;
  loading?: boolean;
  onSubmit: (formState: WizardFormState) => void;
}

const getTimeCopy = (challengeType?: string) => {
  switch (challengeType) {
    case 'leader_only':
      return {
        title: '오늘의 퀘스트를 실천할 시간',
        sub: '리더가 준비한 퀘스트를 이 시간에 함께 해요',
      };
    case 'personal_only':
      return {
        title: '나만의 퀘스트를 실천할 시간',
        sub: '매일 이 시간에 나의 목표를 실행합니다',
      };
    case 'mixed':
      return {
        title: '기준 실천 시간 설정',
        sub: '모든 레이어 퀘스트의 기준 시간이 됩니다',
      };
    case 'leader_personal':
    default:
      return {
        title: '챌린지를 실천할 시간',
        sub: '공통 퀘스트와 나만의 퀘스트를 이 시간에 함께',
      };
  }
};

const formatTime = (hour12: number, minute: number, meridiem: 'AM' | 'PM') =>
  `${meridiem === 'AM' ? '오전' : '오후'} ${hour12}:${String(minute).padStart(2, '0')}`;

const getInitialTimeState = (targetTime?: string): Pick<WizardFormState, 'hour12' | 'minute' | 'meridiem'> => {
  if (!targetTime) {
    return { hour12: 7, minute: 0, meridiem: 'AM' };
  }

  const [hour, minute] = String(targetTime).split(':').map((value) => Number(value));
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return { hour12: 7, minute: 0, meridiem: 'AM' };
  }

  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return { hour12, minute, meridiem };
};

const getVerificationTypeLabel = (verificationType: WizardFormState['questVerificationType']) => {
  if (verificationType === 'image') return '사진';
  if (verificationType === 'text') return '텍스트';
  if (verificationType === 'link') return '링크';
  return '영상';
};

const formatDateInTimezone = (date: Date, timezone: string) => {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}.${get('month')}.${get('day')} ${get('hour')}:${get('minute')}`;
};


const getConfirmQuestPolicy = (challengeType?: string) => {
  if (challengeType === 'mixed') {
    return {
      showDescription: false,
      guide: 'mixed 유형은 confirm에서 제목/인증 방식 위주로 요약합니다.',
    };
  }

  return {
    showDescription: true,
    guide: null,
  };
};

const getManualReviewGuide = (challenge: JoinWizardChallenge, userTimezone: string) => {
  const challengeStartAt = challenge.startAt || challenge.challengeStartAt || challenge.startDate;
  if (!challengeStartAt) {
    return '⏳ 리더 검토 후 승인됩니다 (챌린지 시작 D-1 23:59 마감, 기준 KST)';
  }

  const startDate = new Date(challengeStartAt);
  if (Number.isNaN(startDate.getTime())) {
    return '⏳ 리더 검토 후 승인됩니다 (챌린지 시작 D-1 23:59 마감, 기준 KST)';
  }

  const reviewDeadlineKst = new Date(startDate);
  reviewDeadlineKst.setDate(reviewDeadlineKst.getDate() - 1);
  reviewDeadlineKst.setHours(23, 59, 0, 0);

  const localDeadline = formatDateInTimezone(reviewDeadlineKst, userTimezone);
  return `⏳ 리더 검토 후 승인됩니다 (내 시간 ${localDeadline}, 기준 KST)`;
};

export const JoinWizardBottomSheet = ({ isOpen, onClose, challenge, loading, onSubmit }: JoinWizardBottomSheetProps) => {
  const stepConfigs = useMemo(() => resolveWizardSteps(challenge), [challenge]);
  const [wizardStepIdx, setWizardStepIdx] = useState(0);
  const [slideDir, setSlideDir] = useState(1);
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  const allowedTypes = (challenge.allowedVerificationTypes?.length ? challenge.allowedVerificationTypes : ['image', 'text', 'link', 'video']) as QuestVerificationType[];
  const defaultVerificationType = allowedTypes.includes('image') ? 'image' : allowedTypes[0];

  const [formState, setFormState] = useState<WizardFormState>({
    ...getInitialTimeState(challenge.targetTime),
    questTitle: '',
    questDescription: '',
    questVerificationType: defaultVerificationType,
  });

  useEffect(() => {
    if (!isOpen) return;

    setWizardStepIdx(0);
    setSlideDir(1);
    setFormState((prev) => ({
      ...prev,
      ...getInitialTimeState(challenge.targetTime),
      questTitle: '',
      questDescription: '',
      questVerificationType: defaultVerificationType,
    }));
  }, [isOpen, challenge.targetTime]);

  const currentConfig = stepConfigs[wizardStepIdx];
  const isLastStep = wizardStepIdx === stepConfigs.length - 1;
  const progressRatio = ((wizardStepIdx + 1) / stepConfigs.length) * 100;
  const timeCopy = getTimeCopy(challenge.challengeType);
  const joinRequirements = resolveJoinRequirements(challenge);
  const isQuestRequired = challenge.challengeType === 'personal_only';
  const showQuestDetailFields = Boolean(challenge.personalQuestEnabled);

  const goNext = () => {
    const error = currentConfig.validate(formState);
    if (error) {
      toast.error(error);
      return;
    }

    if (isLastStep) {
      onSubmit(formState);
      return;
    }

    setSlideDir(1);
    setWizardStepIdx((prev) => prev + 1);
  };

  const goPrev = () => {
    if (wizardStepIdx === 0) return;
    setSlideDir(-1);
    setWizardStepIdx((prev) => prev - 1);
  };

  const handleSkip = () => {
    if (currentConfig.required || isLastStep) return;
    setFormState((prev) => ({ ...prev, questTitle: '', questDescription: '' }));
    setSlideDir(1);
    setWizardStepIdx((prev) => prev + 1);
  };

  const renderStep = () => {
    if (currentConfig.id === 'time') {
      return (
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{timeCopy.title}</h3>
            <p className="text-sm text-gray-500 mt-1">{timeCopy.sub}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <select
              value={formState.meridiem}
              onChange={(e) => setFormState((prev) => ({ ...prev, meridiem: e.target.value as 'AM' | 'PM' }))}
              className="px-3 py-2.5 border border-gray-300 rounded-xl"
            >
              <option value="AM">오전</option>
              <option value="PM">오후</option>
            </select>
            <select
              value={formState.hour12}
              onChange={(e) => setFormState((prev) => ({ ...prev, hour12: Number(e.target.value) }))}
              className="px-3 py-2.5 border border-gray-300 rounded-xl"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                <option key={hour} value={hour}>{hour}시</option>
              ))}
            </select>
            <select
              value={formState.minute}
              onChange={(e) => setFormState((prev) => ({ ...prev, minute: Number(e.target.value) }))}
              className="px-3 py-2.5 border border-gray-300 rounded-xl"
            >
              {[0, 10, 20, 30, 40, 50].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
              ))}
            </select>
          </div>

          <p className="text-sm text-gray-600">매일 이 시간에 챌린지를 실천합니다</p>
          <p className="text-xs text-gray-400">표시 시간대: {userTimezone}</p>
        </div>
      );
    }

    if (currentConfig.id === 'quest') {
      return (
        <div className="space-y-4"> 
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {showQuestDetailFields
                ? (isQuestRequired ? '나만의 퀘스트를 등록해주세요' : '나만의 퀘스트를 추가할 수 있어요')
                : '참여를 위한 개인 목표를 입력해주세요'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {showQuestDetailFields
                ? (isQuestRequired ? '이 챌린지는 개인 퀘스트가 필요합니다' : '공통 퀘스트 외 개인 목표를 더할 수 있어요')
                : '입력한 개인 목표는 챌린지 참여 정보로 저장됩니다'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">{joinRequirements.requirePersonalGoalOnJoin ? '개인 목표' : '퀘스트 제목'}</label>
              <span className="text-xs text-gray-400">{formState.questTitle.length}/100</span>
            </div>
            <input
              value={formState.questTitle}
              maxLength={100}
              onChange={(e) => setFormState((prev) => ({ ...prev, questTitle: e.target.value }))}
              placeholder={joinRequirements.requirePersonalGoalOnJoin ? '개인 목표를 입력하세요' : '퀘스트 제목을 입력하세요'}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl"
            />
          </div>

          {showQuestDetailFields && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">퀘스트 설명</label>
                  <span className="text-xs text-gray-400">{formState.questDescription.length}/1000</span>
                </div>
                <textarea
                  value={formState.questDescription}
                  maxLength={1000}
                  rows={4}
                  onChange={(e) => setFormState((prev) => ({ ...prev, questDescription: e.target.value }))}
                  placeholder="퀘스트 설명을 입력하세요"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none"
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">인증 방식</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['image', 'text', 'link', 'video'] as const).map((verificationType) => {
                    const isAllowed = allowedTypes.includes(verificationType);
                    return (
                      <button
                        key={verificationType}
                        type="button"
                        disabled={!isAllowed}
                        onClick={() => isAllowed && setFormState((prev) => ({ ...prev, questVerificationType: verificationType }))}
                        className={`px-2 py-2 rounded-xl text-sm ${
                          formState.questVerificationType === verificationType
                            ? 'bg-primary-600 text-white'
                            : isAllowed
                              ? 'bg-gray-100 text-gray-700'
                              : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        }`}
                      >
                        {verificationType === 'image' && '사진'}
                        {verificationType === 'text' && '텍스트'}
                        {verificationType === 'link' && '링크'}
                        {verificationType === 'video' && '영상'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-xs text-gray-500">
                {challenge.personalQuestAutoApprove
                  ? '✓ 등록 즉시 자동 승인됩니다'
                  : getManualReviewGuide(challenge, userTimezone)}
              </p>
            </>
          )}
        </div>
      );
    }

    const recruitDeadline = challenge.recruitEndDate || challenge.recruitEndAt || challenge.recruitmentEndAt;
    const confirmQuestPolicy = getConfirmQuestPolicy(challenge.challengeType);
    const localRecruitDeadline = (() => {
      if (!recruitDeadline) return null;
      const parsed = new Date(recruitDeadline);
      if (Number.isNaN(parsed.getTime())) return null;
      return formatDateInTimezone(parsed, userTimezone);
    })();

    return (
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 rounded-2xl">
          <p className="text-sm text-gray-500">챌린지</p>
          <p className="text-base font-bold text-gray-900 mt-1">{challenge.badgeIcon || '🎯'} {challenge.title || '챌린지'}</p>
        </div>

        <div className="p-4 border border-gray-200 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">실천 시간</span>
            <span className="font-semibold text-gray-900">{formatTime(formState.hour12, formState.minute, formState.meridiem)}</span>
          </div>

          {!!formState.questTitle.trim() && (
            <>
              <div className="border-t border-gray-100 pt-2" />
              <p className="text-sm text-gray-500">{showQuestDetailFields ? '나만의 퀘스트' : '개인 목표'}</p>
              <p className="font-semibold text-gray-900">{formState.questTitle.trim()}</p>
              {showQuestDetailFields && confirmQuestPolicy.showDescription && !!formState.questDescription.trim() && (
                <p className="text-xs text-gray-600 line-clamp-2">{formState.questDescription.trim()}</p>
              )}
              {showQuestDetailFields && <p className="text-xs text-gray-500">인증: {getVerificationTypeLabel(formState.questVerificationType)}</p>}
              {showQuestDetailFields && (
                <p className="text-xs text-gray-500">
                  {challenge.personalQuestAutoApprove ? '자동 승인' : '리더 검토 후 승인'}
                </p>
              )}
              {showQuestDetailFields && confirmQuestPolicy.guide && (
                <p className="text-[11px] text-gray-400">{confirmQuestPolicy.guide}</p>
              )}
            </>
          )}

          {localRecruitDeadline && (
            <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
              <span className="text-gray-500">모집 마감</span>
              <span className="text-gray-900">{localRecruitDeadline} (내 시간)</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="챌린지 참여 위자드 🚀">
      <div className="px-6 pb-8">
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>{wizardStepIdx + 1} / {stepConfigs.length}</span>
            <span>{currentConfig.id.toUpperCase()}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 transition-all" style={{ width: `${progressRatio}%` }} />
          </div>
        </div>

        <div className="min-h-[320px]">
          <AnimatePresence mode="wait" custom={slideDir}>
            <motion.div
              key={currentConfig.id}
              custom={slideDir}
              initial={{ x: slideDir > 0 ? 40 : -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: slideDir > 0 ? -40 : 40, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={wizardStepIdx === 0 || !!loading}
            className="px-3 py-3 rounded-xl border border-gray-300 text-sm disabled:opacity-40"
          >
            이전
          </button>

          {!currentConfig.required && !isLastStep ? (
            <button
              type="button"
              onClick={handleSkip}
              disabled={!!loading}
              className="px-3 py-3 rounded-xl bg-gray-100 text-sm text-gray-700 disabled:opacity-40"
            >
              건너뛰기
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={goNext}
            disabled={!!loading}
            className="px-3 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-40"
          >
            {loading ? '처리 중...' : isLastStep ? '참여하기 🚀' : '다음 →'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
