import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiUsers, FiTrendingUp, FiClock } from 'react-icons/fi';
import { Button } from '@/shared/components/Button';
import { Loading } from '@/shared/components/Loading';
import toast from 'react-hot-toast';
import { JoinWizardBottomSheet } from '@/features/challenge/components/JoinWizardBottomSheet';
import { WizardFormState } from '@/features/challenge/components/join-wizard/types';
import { useAuthStore } from '@/stores/authStore';
import { challengeApi } from '@/features/challenge/api/challengeApi';
import { SLUG_TO_LABEL } from '@/features/challenge/constants/categories';
import { getChallengeTypeLabel } from '@/features/challenge/utils/flowPolicy';
import { PaymentSheet } from '@/features/commerce/components/PaymentSheet';
import { isPaidChallenge } from '@/features/commerce/api/commerceApi';

const parseTargetTimeToFormState = (targetTime?: string): WizardFormState => {
  const fallback: WizardFormState = {
    hour12: 7,
    minute: 0,
    meridiem: 'AM',
    questTitle: '',
    questDescription: '',
    questAllowedVerificationTypes: ['image', 'text', 'link', 'video'],
  };

  if (!targetTime) return fallback;

  const [hour, minute] = String(targetTime).split(':').map((value) => Number(value));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return fallback;

  return {
    ...fallback,
    hour12: hour % 12 === 0 ? 12 : hour % 12,
    minute,
    meridiem: hour >= 12 ? 'PM' : 'AM',
  };
};

// 인증(참여) 방식 라벨
const VERIFICATION_LABEL: Record<string, string> = {
  image: '📸 사진',
  text: '📝 텍스트',
  link: '🔗 링크',
  video: '🎬 영상',
};

// ISO → KST 'M/D' (없으면 null)
function formatKstShort(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const [, m, day] = d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }).split('-');
  return `${Number(m)}/${Number(day)}`;
}

export const ChallengeDetailPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isJoinWizardOpen, setIsJoinWizardOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [pendingFormState, setPendingFormState] = useState<WizardFormState | null>(null);
  const [paidOrderId, setPaidOrderId] = useState<string | null>(null);
  const useNewJoinWizard = String(import.meta.env.VITE_USE_NEW_JOIN_WIZARD ?? 'true') === 'true';
  const user = useAuthStore((s) => s.user);

  const { data: challenge, isLoading } = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: async () => {
      const response = await apiClient.get(`/public/challenges/${challengeId}`);
      return response.data.data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['challenge-stats', challengeId],
    queryFn: async () => {
      const response = await apiClient.get(`/public/challenges/${challengeId}/stats`);
      return response.data.data.stats;
    },
  });


  const { data: previewBoard } = useQuery({
    queryKey: ['preview-board', challengeId],
    queryFn: async () => {
      const response = await apiClient.get(`/public/board/${challengeId}/preview`);
      return response.data;
    },
  });

  const { data: myChallengesData } = useQuery({
    queryKey: ['my-challenges', 'active-on-detail'],
    queryFn: async () => {
      const response = await apiClient.get('/c/challenges/my?status=active');
      return response.data.data;
    },
  });

  const joinMutation = useMutation({
    mutationFn: async ({ formState, orderId }: { formState: WizardFormState; orderId?: string | null }) => {
      const questTitle = formState.questTitle.trim();
      const response = await apiClient.post(`/c/challenges/${challengeId}/join`, {
        personalGoal: questTitle || undefined,
        personalTarget: {
          hour12: formState.hour12,
          minute: formState.minute,
          meridiem: formState.meridiem,
          timezone: 'Asia/Seoul',
        },
        // 유료 챌린지는 paid 주문 필수 (커머스 v0 — 402 ORDER_REQUIRED/ORDER_NOT_PAID)
        ...(orderId ? { orderId } : {}),
      });

      return {
        joinResult: response.data,
        formState,
      };
    },
    onSuccess: async ({ joinResult, formState }) => {
      const userChallengeId = joinResult?.data?.userChallengeId;
      const hasQuestInput = formState.questTitle.trim() && formState.questDescription.trim();
      void userChallengeId;

      // 개인퀘스트 제안 (challenge-api PORTING.md §7-e) — join 성공 후 입력값이 있으면 제출
      if (hasQuestInput) {
        try {
          await challengeApi.submitQuestProposal(challengeId!, {
            title: formState.questTitle.trim(),
            description: formState.questDescription.trim(),
          });
          toast.success('개인 퀘스트 제안을 접수했어요. 리더 승인을 기다려주세요 ✨');
        } catch (proposalError: any) {
          toast.error(
            proposalError?.response?.data?.message ||
              '개인 퀘스트 제안 제출에 실패했어요. ME 탭에서 다시 시도해주세요.',
          );
        }
      }

      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      queryClient.invalidateQueries({ queryKey: ['quest-proposals', challengeId] });
      toast.success('챌린지 참여 완료! 오늘부터 시작하세요 🎉');
      setIsJoinWizardOpen(false);
      setIsPaymentOpen(false);
      setPendingFormState(null);
      navigate('/me');
    },
    onError: (error: any) => {
      // 유료 챌린지: 주문 없이/미결제 주문으로 join 시 결제 단계로 안내
      if (error?.response?.status === 402) {
        toast.error(error.response?.data?.message || '결제 후 참여할 수 있어요');
        setIsPaymentOpen(true);
        return;
      }
      toast.error(error.response?.data?.message || '참여에 실패했습니다');
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => challengeApi.publishChallenge(challengeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['my-created-challenges'] });
      toast.success('챌린지가 공개되었습니다! 🎉');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '공개에 실패했습니다');
    },
  });

  const advanceLifecycleMutation = useMutation({
    // 수동 전환 — 예약 시각보다 먼저 가능, 지나간 예약은 무시 (docs/time-policy.md R1·R3)
    mutationFn: async (action: 'close_recruiting' | 'confirm_start') => {
      const response =
        action === 'close_recruiting'
          ? await apiClient.post(`/c/challenges/${challengeId}/close-recruiting`)
          : await apiClient.post(`/c/challenges/${challengeId}/start`);
      return response.data;
    },
    onSuccess: (res: any) => {
      toast.success(res?.message || '처리가 완료됐어요');
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-stats', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-feed', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      queryClient.invalidateQueries({ queryKey: ['my-created-challenges'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '처리에 실패했습니다');
    },
  });

  if (isLoading) return <Loading fullScreen />;
  if (!challenge) return <div className="p-6 text-center text-gray-500">챌린지를 찾을 수 없습니다</div>;

  // 표시용 상태는 effectiveLifecycle 우선 — 워커(10분 주기) 전이 지연 흡수 (docs/time-policy.md R4)
  const lifecycle = String(challenge.effectiveLifecycle || challenge.lifecycle || 'draft');
  const isCreator = challenge.createdBy === user?.userId;
  const requiresPayment = isPaidChallenge(challenge);

  // 시작 후(진행/완료)에만 완료 통계가 의미 있음 — 모집중·준비중엔 숨긴다
  const hasStarted = lifecycle === 'active' || lifecycle === 'completed';

  // 챌린지 정보(유형·일정·참여 방식) — 실제 데이터로 구성
  const scheduleParts: string[] = [];
  const recStart = formatKstShort(challenge.recruitingStartAt);
  const recEnd = formatKstShort(challenge.recruitingEndAt);
  const startAt = formatKstShort(challenge.challengeStartAt);
  if (recStart && recEnd) scheduleParts.push(`모집 ${recStart}~${recEnd}`);
  if (startAt) scheduleParts.push(`${startAt} 시작`);
  if (challenge.durationDays) scheduleParts.push(`${challenge.durationDays}일간`);
  const scheduleText = scheduleParts.join(' · ') || '-';
  const verificationTypes: string[] = Array.isArray(challenge.allowedVerificationTypes)
    ? challenge.allowedVerificationTypes
    : [];
  const verificationText =
    verificationTypes.map((t: string) => VERIFICATION_LABEL[t] ?? t).join(' · ') || '-';

  // 가이드 미리보기 — system-prefill 자동생성분(유형/일정 placeholder)은 제외하고 리더 작성분만
  const guideBlocks: any[] =
    previewBoard && previewBoard.updatedBy !== 'system-prefill' && Array.isArray(previewBoard.blocks)
      ? previewBoard.blocks
      : [];

  // 유료 챌린지: join 전에 결제(주문 paid) 단계를 거친다 (커머스 v0)
  const startJoin = (formState: WizardFormState) => {
    if (requiresPayment && !paidOrderId) {
      setPendingFormState(formState);
      setIsJoinWizardOpen(false);
      setIsPaymentOpen(true);
      return;
    }
    joinMutation.mutate({ formState, orderId: paidOrderId });
  };
  const alreadyJoined = (myChallengesData?.challenges ?? []).some((item: any) => (item.challengeId ?? item.challenge?.challengeId) === challengeId);
  const canJoin = lifecycle === 'recruiting' && !alreadyJoined && !isCreator;

  const ctaLabelMap: Record<string, string> = {
    recruiting: isCreator ? '내가 만든 챌린지' : alreadyJoined ? '이미 참여신청한 챌린지' : '챌린지 참여 신청하기',
    preparing: '모집이 마감된 챌린지',
    active: '진행 중 (신규 참여 불가)',
    completed: '종료된 챌린지',
    archived: '보관된 챌린지',
    draft: '모집 전 챌린지',
  };

  const lifecycleHintMap: Record<string, string> = {
    recruiting: alreadyJoined ? '이미 참여신청을 완료한 챌린지입니다.' : '지금 참여 신청할 수 있습니다.',
    preparing: '모집이 종료되어 새로운 참여 신청은 불가능합니다. 준비중 가이드만 확인할 수 있어요.',
    active: '챌린지가 진행 중이라 신규 참여가 불가능합니다.',
    completed: '종료된 챌린지입니다.',
    archived: '보관된 챌린지입니다.',
    draft: '아직 공개되지 않은 챌린지입니다.',
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 glass-header px-6 py-4 flex items-center gap-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">챌린지 상세</h1>
      </div>

      {isCreator && (
        <div className="bg-primary-50 border-b border-primary-100 px-4 py-3">
          {/* 1줄: 라벨 + 상태 변경 버튼(약간 크게) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-primary-700 font-semibold">✏️ 내가 만든 챌린지</span>

            {/* draft → recruiting */}
            {lifecycle === 'draft' && (
              <button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
                className="text-sm bg-primary-500 text-white px-4 py-2 rounded-full font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {publishMutation.isPending ? '공개 중...' : '모집 시작하기'}
              </button>
            )}

            {/* recruiting → preparing (수동 모집 마감) */}
            {lifecycle === 'recruiting' && (
              <button
                onClick={() => {
                  if (window.confirm('모집을 지금 마감할까요? 이후 신규 참여 신청이 불가하며, 예약된 마감 시각이 남아 있어도 무시됩니다.')) {
                    advanceLifecycleMutation.mutate('close_recruiting');
                  }
                }}
                disabled={advanceLifecycleMutation.isPending}
                className="text-sm bg-rose-500 text-white px-4 py-2 rounded-full font-semibold hover:bg-rose-600 disabled:opacity-50 transition-colors"
              >
                {advanceLifecycleMutation.isPending ? '처리 중...' : '모집 마감하기'}
              </button>
            )}

            {/* preparing → active (챌린지 시작 확인) */}
            {lifecycle === 'preparing' && (
              <button
                onClick={() => {
                  if (window.confirm('챌린지를 지금 시작할까요? 오늘이 Day 1이 되고 예약된 시작 시각은 무시됩니다. 승인된 참여자는 즉시 활성화되고, 승인 대기 중인 신청은 자동 거절됩니다.')) {
                    advanceLifecycleMutation.mutate('confirm_start');
                  }
                }}
                disabled={advanceLifecycleMutation.isPending}
                className="text-sm bg-emerald-500 text-white px-4 py-2 rounded-full font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {advanceLifecycleMutation.isPending ? '처리 중...' : '챌린지 시작하기'}
              </button>
            )}
          </div>

          {/* 2줄: 나머지 버튼 */}
          <div className="flex gap-2 flex-wrap mt-2">
            {/* 참여자 심사 */}
            {['recruiting', 'preparing'].includes(lifecycle) && (stats?.pendingParticipants ?? 0) > 0 && (
              <button
                onClick={() => navigate(`/challenges/${challengeId}/join-requests`)}
                className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-full font-medium hover:bg-amber-600 transition-colors"
              >
                참여자 심사 ({stats?.pendingParticipants}명)
              </button>
            )}

            {/* 수정 버튼 (draft, recruiting 상태만 — 진행 중엔 숨김) */}
            {['draft', 'recruiting'].includes(lifecycle) && (
              <button
                onClick={() => navigate(`/challenges/${challengeId}/edit`)}
                className="text-xs bg-white border border-primary-200 text-primary-700 px-3 py-1.5 rounded-full font-medium hover:bg-primary-50 transition-colors"
              >
                수정하기
              </button>
            )}

            <button
              onClick={() => navigate(`/challenge-board/${challengeId}`)}
              className="text-xs bg-white border border-primary-200 text-primary-700 px-3 py-1.5 rounded-full font-medium hover:bg-primary-50 transition-colors"
            >
              가이드
            </button>

            <button
              onClick={() => navigate(`/challenge-feed/${challengeId}`)}
              className="text-xs bg-white border border-primary-200 text-primary-700 px-3 py-1.5 rounded-full font-medium hover:bg-primary-50 transition-colors"
            >
              챌린지 피드
            </button>
          </div>
        </div>
      )}

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
                {SLUG_TO_LABEL[challenge.category] ?? challenge.category}
              </span>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{challenge.title}</h2>
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <FiClock className="w-4 h-4" />
                목표 시간: {challenge.targetTime}
              </p>
            </div>
          </div>

          <p className="text-gray-700 leading-relaxed mb-6">{challenge.description}</p>

          {stats && (
            hasStarted ? (
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
            ) : (
              <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                <FiUsers className="w-4 h-4" />
                <span>참여자 <strong className="text-gray-900">{stats.totalParticipants}</strong>명</span>
              </div>
            )
          )}

          {hasStarted && stats?.dayCompletionRates && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 mb-3">Day별 완료율</p>
              {stats.dayCompletionRates.map((day: any) => (
                <div key={day.day} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-600 w-12">Day {day.day}</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all" style={{ width: `${day.completionRate}%` }} />
                  </div>
                  <span className="text-sm text-gray-600 w-12 text-right">{Math.round(day.completionRate)}%</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4">챌린지 정보</h3>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="w-16 flex-shrink-0 text-gray-400">유형</span>
              <span className="text-gray-800 font-medium">
                {getChallengeTypeLabel(challenge.challengeType)}
              </span>
            </div>
            <div className="flex gap-3">
              <span className="w-16 flex-shrink-0 text-gray-400">일정</span>
              <span className="text-gray-800">{scheduleText}</span>
            </div>
            <div className="flex gap-3">
              <span className="w-16 flex-shrink-0 text-gray-400">참여 방식</span>
              <span className="text-gray-800">{verificationText}</span>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">가이드 미리보기</h3>
            {guideBlocks.length > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-gray-50 border border-gray-200 text-gray-600">
                {guideBlocks.length}개
              </span>
            )}
          </div>

          <div className="space-y-3">
            {guideBlocks.map((block: any) => {
              if (block.type === 'image') {
                return <img key={block.id} src={block.url} alt="preview" className="w-full rounded-xl border border-gray-100" />;
              }
              if (block.type === 'link') {
                return (
                  <a key={block.id} href={block.url} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 underline break-all">
                    {block.label || block.url}
                  </a>
                );
              }
              return (
                <p key={block.id} className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {block.content}
                </p>
              );
            })}
            {guideBlocks.length === 0 && (
              isCreator ? (
                <div className="text-center py-3">
                  <p className="text-sm text-gray-500 mb-3">
                    아직 가이드를 작성하지 않았어요.
                    <br />
                    참여자에게 챌린지 진행 방법을 안내해보세요.
                  </p>
                  <button
                    onClick={() => navigate(`/challenge-board/${challengeId}`)}
                    className="text-sm bg-primary-500 text-white px-4 py-2 rounded-full font-medium hover:bg-primary-600 transition-colors"
                  >
                    가이드 작성하기 →
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">가이드가 아직 작성되지 않았어요.</p>
              )
            )}
          </div>
        </motion.section>

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
              <div className="flex items-center gap-1 mt-1">
                <p className="text-sm text-gray-600">"나는 {challenge.identityKeyword} 사람"</p>
                <span
                  title="챌린지를 완주하면 이 정체성 키워드를 가진 사람이 됩니다"
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] cursor-help"
                >
                  ?
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        <p className="text-sm text-gray-600 mb-3">
          상태: <span className="font-semibold">{lifecycle}</span> · {lifecycleHintMap[lifecycle] ?? '참여 가능 상태를 확인해주세요.'}
        </p>

        {!useNewJoinWizard && canJoin && (
          <p className="text-xs text-amber-700 mb-3">
            점진 롤아웃 설정으로 간편 참여 모드가 활성화되어, 기본 시간으로 즉시 참여합니다.
          </p>
        )}

        {alreadyJoined && (
          <p className="text-xs text-amber-700 mb-3">이미 참여신청한 챌린지입니다. ME 탭에서 준비/진행 상태를 확인해주세요.</p>
        )}

        <Button
          fullWidth
          size="lg"
          onClick={() => {
            if (!canJoin) return;
            if (useNewJoinWizard) {
              setIsJoinWizardOpen(true);
              return;
            }
            startJoin(parseTargetTimeToFormState(challenge?.targetTime));
          }}
          loading={joinMutation.isPending}
          disabled={!canJoin || alreadyJoined}
        >
          {ctaLabelMap[lifecycle] ?? '챌린지 참여하기'}
        </Button>

        <p className="text-xs text-gray-500 text-center mt-4">💡 오늘부터 7일간 진행됩니다</p>
      </div>

      {useNewJoinWizard && (
        <JoinWizardBottomSheet
          isOpen={isJoinWizardOpen}
          onClose={() => setIsJoinWizardOpen(false)}
          challenge={challenge}
          loading={joinMutation.isPending}
          onSubmit={(formState) => startJoin(formState)}
        />
      )}

      <PaymentSheet
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        challenge={{
          challengeId,
          title: challenge.title,
          badgeIcon: challenge.badgeIcon,
          price: challenge.price,
          pricingType: challenge.pricingType,
        }}
        joining={joinMutation.isPending}
        onPaid={(orderId) => {
          setPaidOrderId(orderId);
          joinMutation.mutate({
            formState: pendingFormState ?? parseTargetTimeToFormState(challenge?.targetTime),
            orderId,
          });
        }}
      />
    </div>
  );
};
