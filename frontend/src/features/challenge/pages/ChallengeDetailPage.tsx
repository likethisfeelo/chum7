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

const parseTargetTimeToFormState = (targetTime?: string): WizardFormState => {
  const fallback: WizardFormState = {
    hour12: 7,
    minute: 0,
    meridiem: 'AM',
    questTitle: '',
    questDescription: '',
    questVerificationType: 'image',
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

export const ChallengeDetailPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isJoinWizardOpen, setIsJoinWizardOpen] = useState(false);
  const useNewJoinWizard = String(import.meta.env.VITE_USE_NEW_JOIN_WIZARD ?? 'true') === 'true';

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


  const { data: previewBoard } = useQuery({
    queryKey: ['preview-board', challengeId],
    queryFn: async () => {
      const response = await apiClient.get(`/preview-board/${challengeId}`);
      return response.data;
    },
  });

  const { data: myChallengesData } = useQuery({
    queryKey: ['my-challenges', 'active-on-detail'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=active');
      return response.data.data;
    },
  });

  const joinMutation = useMutation({
    mutationFn: async (formState: WizardFormState) => {
      const response = await apiClient.post(`/challenges/${challengeId}/join`, {
        personalTarget: {
          hour12: formState.hour12,
          minute: formState.minute,
          meridiem: formState.meridiem,
          timezone: 'Asia/Seoul',
        },
      });

      return {
        joinResult: response.data,
        formState,
      };
    },
    onSuccess: async ({ joinResult, formState }) => {
      const userChallengeId = joinResult?.data?.userChallengeId;
      const hasQuestInput = formState.questTitle.trim() && formState.questDescription.trim();

      if (challenge?.personalQuestEnabled && hasQuestInput && userChallengeId) {
        try {
          await apiClient.post(`/challenges/${challengeId}/personal-quest`, {
            userChallengeId,
            title: formState.questTitle.trim(),
            description: formState.questDescription.trim(),
            verificationType: formState.questVerificationType,
          });
        } catch (e: any) {
          toast.error(e?.response?.data?.message || '개인 퀘스트 제안 제출에 실패했습니다');
        }
      }

      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      toast.success('챌린지 참여 완료! 오늘부터 시작하세요 🎉');
      setIsJoinWizardOpen(false);
      navigate('/me');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '참여에 실패했습니다');
    },
  });

  if (isLoading) return <Loading fullScreen />;
  if (!challenge) return <div className="p-6 text-center text-gray-500">챌린지를 찾을 수 없습니다</div>;

  const lifecycle = String(challenge.lifecycle || 'draft');
  const alreadyJoined = (myChallengesData?.challenges ?? []).some((item: any) => (item.challengeId ?? item.challenge?.challengeId) === challengeId);
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
    preparing: '모집이 종료되어 새로운 참여 신청은 불가능합니다. 준비중 공지/게시판만 확인할 수 있어요.',
    active: '챌린지가 진행 중이라 신규 참여가 불가능합니다.',
    completed: '종료된 챌린지입니다.',
    archived: '보관된 챌린지입니다.',
    draft: '아직 공개되지 않은 챌린지입니다.',
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">챌린지 상세</h1>
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{challenge.title}</h2>
              <p className="text-sm text-gray-600 flex items-center gap-1">
                <FiClock className="w-4 h-4" />
                목표 시간: {challenge.targetTime}
              </p>
            </div>
          </div>

          <p className="text-gray-700 leading-relaxed mb-6">{challenge.description}</p>

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

          {stats?.dayCompletionRates && (
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
          transition={{ delay: 0.08 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">프리뷰 보드</h3>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-50 border border-gray-200 text-gray-600">
              {previewBoard?.blocks?.length || 0} blocks
            </span>
          </div>

          <div className="space-y-3">
            {(previewBoard?.blocks || []).map((block: any) => {
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
            {(!previewBoard?.blocks || previewBoard.blocks.length === 0) && (
              <p className="text-sm text-gray-500">프리뷰 보드가 아직 작성되지 않았어요.</p>
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
            joinMutation.mutate(parseTargetTimeToFormState(challenge?.targetTime));
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
          onSubmit={(formState) => joinMutation.mutate(formState)}
        />
      )}
    </div>
  );
};
