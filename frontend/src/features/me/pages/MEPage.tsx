import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { ProgressBar } from '@/shared/components/ProgressBar';
import { VerificationSheet } from '@/features/verification/components/VerificationSheet';
import { getChallengeTypeLabel as getChallengeTypeLabelByType, getRemedyLabel, getRemedyType, getRemainingRemedyCount } from '@/features/challenge/utils/flowPolicy';
import toast from 'react-hot-toast';

type METab = 'active' | 'pending' | 'completed';

const DAY_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500',
  failed: 'bg-red-300',
  remedy: 'bg-purple-400',
  skipped: 'bg-gray-200',
  pending: 'bg-gray-100 border-2 border-gray-300',
};

function getChallengeTypeLabel(challenge: any) {
  const type = String(challenge?.challenge?.challengeType || challenge?.challenge?.type || 'leader_personal');
  return getChallengeTypeLabelByType(type);
}

function getTodayGuide(challenge: any) {
  const type = String(challenge?.challenge?.challengeType || challenge?.challenge?.type || '').toLowerCase();
  if (type === 'leader_only') return '오늘은 리더가 제시한 공통 퀘스트를 인증해요.';
  if (type === 'personal_only') return '오늘은 나만의 개인 퀘스트 실천 내용을 기록해요.';
  if (type === 'leader_personal' || type === 'mixed') return '공통/개인 퀘스트 중 오늘 수행한 항목을 선택해 인증해요.';
  return '오늘 실천한 내용을 인증하고, 필요하면 추가 기록도 남길 수 있어요.';
}

const getProposalStatusMeta = (status?: string) => {
  const key = String(status || 'pending');
  if (key === 'approved') return { label: '승인됨', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', nextAction: '승인 완료. 활성 단계에서 인증을 진행하세요.' };
  if (key === 'rejected') return { label: '수정 필요', color: 'text-rose-700 bg-rose-50 border-rose-200', nextAction: '리더 피드백 반영 후 /quests 페이지에서 수정 재제출이 필요합니다.' };
  if (key === 'revision_pending') return { label: '재심사 대기', color: 'text-indigo-700 bg-indigo-50 border-indigo-200', nextAction: '리더가 수정본을 검토 중입니다. 결과를 기다려주세요.' };
  if (key === 'expired') return { label: '기간 만료', color: 'text-gray-700 bg-gray-100 border-gray-200', nextAction: '제안 마감이 지나 개인 퀘스트 없이 진행됩니다.' };
  if (key === 'disqualified') return { label: '자격 제한', color: 'text-gray-700 bg-gray-200 border-gray-300', nextAction: '개인 퀘스트 제안 자격이 제한되었습니다.' };
  return { label: '검토중', color: 'text-amber-700 bg-amber-50 border-amber-200', nextAction: '리더 검토 결과를 기다려주세요.' };
};

export const MEPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<METab>('active');
  const [selectedChallenge, setSelectedChallenge] = useState<any>(null);
  const [showVerification, setShowVerification] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-challenges'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=active');
      return response.data.data;
    },
  });

  const challenges = data?.challenges || [];

  const { data: completedChallengesData } = useQuery({
    queryKey: ['my-challenges-completed'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=completed');
      return response.data.data;
    },
  });

  const { data: extraCountData } = useQuery({
    queryKey: ['verifications', 'mine-extra-count'],
    queryFn: async () => {
      const response = await apiClient.get('/verifications?mine=true&isExtra=true&limit=1');
      return response.data.data;
    },
  });

  const personalQuestTargetChallenges = useMemo(
    () => challenges.filter((challenge: any) => Boolean(challenge?.challenge?.personalQuestEnabled)),
    [challenges],
  );

  const { data: personalQuestProposalMap } = useQuery({
    queryKey: ['my-personal-quest-proposals', personalQuestTargetChallenges.map((c: any) => c.challengeId).join(',')],
    enabled: personalQuestTargetChallenges.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        personalQuestTargetChallenges.map(async (challenge: any) => {
          const response = await apiClient.get(`/challenges/${challenge.challengeId}/personal-quest`);
          return [challenge.challengeId, response.data?.data?.latestProposal || null] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, any>;
    },
  });

  const [leaderDmTargetId, setLeaderDmTargetId] = useState<string | null>(null);

  const leaderDmMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      setLeaderDmTargetId(challengeId);
      const response = await apiClient.post(`/challenge-feed/${challengeId}/leader-dm`);
      return response.data;
    },
    onSuccess: async (res: any) => {
      const threadId = res?.threadId || res?.data?.threadId;
      const deepLink = res?.deepLink || res?.data?.deepLink;
      const isNew = res?.isNew ?? res?.data?.isNew;
      const message = isNew ? '리더 DM 대화가 열렸어요 ✉️' : '기존 리더 DM 대화로 연결했어요 ✉️';
      if (threadId && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(threadId));
      }
      if (typeof deepLink === 'string' && deepLink.startsWith('/messages/')) {
        toast.success(message);
        navigate(deepLink);
        return;
      }
      toast.success(threadId ? `${message} (threadId 복사됨)` : message);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '리더 DM 연결에 실패했습니다');
    },
    onSettled: () => {
      setLeaderDmTargetId(null);
    },
  });

  const handleLeaderDm = (challenge: any) => {
    const challengeId = challenge?.challengeId || challenge?.challenge?.challengeId;
    if (!challengeId) {
      toast.error('챌린지 정보를 찾지 못했습니다');
      return;
    }
    leaderDmMutation.mutate(challengeId);
  };

  const pendingChallenges = useMemo(
    () => challenges.filter((challenge: any) => {
      const lifecycle = String(challenge.challenge?.lifecycle || '');
      return lifecycle === 'recruiting' || lifecycle === 'preparing' || challenge.phase === 'preparing';
    }),
    [challenges],
  );

  const activeChallenges = useMemo(
    () => challenges.filter((challenge: any) => String(challenge.challenge?.lifecycle || '') === 'active'),
    [challenges],
  );

  const completedChallenges = useMemo(
    () => completedChallengesData?.challenges || [],
    [completedChallengesData],
  );

  const handleVerify = (challenge: any) => {
    setSelectedChallenge(challenge);
    setShowVerification(true);
  };

  const TAB_CONFIG: { key: METab; label: string; count: number }[] = [
    { key: 'active', label: '진행중', count: activeChallenges.length },
    { key: 'pending', label: '준비중', count: pendingChallenges.length },
    { key: 'completed', label: '완료', count: completedChallenges.length },
  ];

  const isEmpty = activeChallenges.length === 0 && pendingChallenges.length === 0 && completedChallenges.length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 pt-12 pb-8 px-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-white/80 text-sm">안녕하세요!</p>
            <h1 className="text-white font-bold text-2xl">{user?.name || '챌린저'}님 👋</h1>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl"
          >
            {user?.animalIcon || '🐰'}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {isLoading ? (
          <Loading />
        ) : isEmpty ? (
          <EmptyState
            icon="🎯"
            title="진행 중인 챌린지가 없어요"
            description="새로운 챌린지에 참여하고 7일 여정을 시작해보세요!"
            action={{
              label: '챌린지 참여하기',
              onClick: () => navigate('/challenges'),
            }}
          />
        ) : (
          <>
            {/* 탭 */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`ml-1 text-xs ${activeTab === tab.key ? 'text-primary-600' : 'text-gray-400'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* 진행중 탭 */}
            {activeTab === 'active' && (
              <div className="space-y-4">
                {activeChallenges.length === 0 ? (
                  <EmptyState icon="🏃" title="진행 중인 챌린지가 없어요" description="챌린지에 참여하고 오늘부터 시작해보세요" />
                ) : activeChallenges.map((challenge: any, index: number) => {
                  const progress = challenge.progress || [];
                  const completedDays = progress.filter((p: any) => p.status === 'success').length;
                  const currentDay = challenge.currentDay || 1;
                  const todayDone = progress[currentDay - 1]?.status === 'success';

                  return (
                    <motion.div
                      key={challenge.userChallengeId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="text-3xl">{challenge.challenge?.badgeIcon || '🎯'}</div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900">{challenge.challenge?.title}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm text-primary-600">Day {currentDay} / 7</p>
                            <span className="px-2 py-0.5 text-[11px] rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                              {getChallengeTypeLabel(challenge)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">{challenge.score || 0}</p>
                          <p className="text-xs text-gray-500">점수</p>
                        </div>
                      </div>

                      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-4">
                        💡 {getTodayGuide(challenge)}
                      </p>

                      <div className="mb-4">
                        <ProgressBar current={completedDays} total={7} />
                      </div>

                      <div className="flex gap-2 mb-4">
                        {Array.from({ length: 7 }, (_, i) => {
                          const dayStatus = progress[i]?.status || (i < currentDay - 1 ? 'skipped' : 'pending');
                          return (
                            <div
                              key={i}
                              className={`flex-1 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${DAY_STATUS_COLORS[dayStatus] || 'bg-gray-100'}`}
                            >
                              <span className={dayStatus === 'pending' ? 'text-gray-400' : 'text-white'}>
                                {i + 1}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {(() => {
                        const remedyType = getRemedyType(challenge.remedyPolicy);
                        const remaining = getRemainingRemedyCount(challenge.remedyPolicy, progress);
                        return (
                          <div className="mb-4 rounded-lg border border-purple-100 bg-purple-50 px-3 py-2 text-xs text-purple-800">
                            레메디 정책: {getRemedyLabel(challenge.remedyPolicy)} · 남은 보완 {remaining === null ? '제한 없음' : `${remaining}회`}
                            {remedyType === 'strict' && <span className="ml-1 font-semibold">(보완 버튼 비노출)</span>}
                          </div>
                        );
                      })()}

                      {!todayDone && currentDay <= 7 ? (
                        <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleVerify(challenge)}
                          className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all"
                        >
                          Day {currentDay} 인증하기 📸
                        </motion.button>
                      ) : todayDone ? (
                        <div className="w-full py-3 bg-green-50 text-green-600 font-semibold rounded-xl text-center">
                          ✅ 오늘 인증 완료!
                        </div>
                      ) : (
                        <div className="w-full py-3 bg-gray-50 text-gray-500 font-semibold rounded-xl text-center">
                          챌린지 완료 🎉
                        </div>
                      )}

                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/challenge-feed/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                          className="py-2.5 rounded-xl border border-primary-200 text-primary-700 bg-primary-50 text-sm"
                        >
                          피드
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/challenge-board/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                          className="py-2.5 rounded-xl border border-amber-200 text-amber-700 bg-amber-50 text-sm"
                        >
                          보드
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLeaderDm(challenge)}
                          disabled={leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId)}
                          className="py-2.5 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-50 text-sm"
                        >
                          {leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId) ? 'DM 중...' : '리더 DM'}
                        </button>
                      </div>

                      {(() => {
                        const remedyType = getRemedyType(challenge.remedyPolicy);
                        const remaining = getRemainingRemedyCount(challenge.remedyPolicy, progress);
                        const failedDays = progress.filter((p: any) => p.day <= 5 && p.status !== 'success' && !p.remedied);
                        const canRemedy = remedyType !== 'strict' && (remaining === null || remaining > 0) && failedDays.length > 0;
                        if (remedyType === 'strict') return null;
                        return (
                          <button
                            type="button"
                            onClick={() => navigate(`/verification/remedy?userChallengeId=${challenge.userChallengeId}`)}
                            disabled={!canRemedy}
                            className="mt-2 w-full py-2.5 rounded-xl border border-purple-200 text-purple-700 bg-purple-50 disabled:opacity-50 text-sm"
                          >
                            Day 6 보완하기 {remaining === null ? '(제한 없음)' : `(${remaining}회 남음)`}
                          </button>
                        );
                      })()}
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* 준비중 탭 */}
            {activeTab === 'pending' && (
              <div className="space-y-3">
                {pendingChallenges.length === 0 ? (
                  <EmptyState icon="⏳" title="준비 중인 챌린지가 없어요" description="모집중 챌린지에 참여 신청해보세요" />
                ) : pendingChallenges.map((challenge: any) => {
                  const lifecycle = String(challenge.challenge?.lifecycle || 'preparing');
                  const statusLabel = lifecycle === 'recruiting' ? '리크루팅' : '준비중';
                  const proposal = personalQuestProposalMap?.[challenge.challengeId];
                  const statusMeta = getProposalStatusMeta(proposal?.status);

                  return (
                    <div key={challenge.userChallengeId} className="bg-white rounded-2xl p-5 border border-amber-200 space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{challenge.challenge?.badgeIcon || '🎯'}</span>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{challenge.challenge?.title}</p>
                          <p className="text-xs text-amber-700 mt-0.5">
                            시작일: {challenge.startDate || '-'} · {statusLabel}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/challenge-feed/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                          className="py-2 rounded-lg border border-primary-200 bg-white text-primary-700 text-sm"
                        >
                          피드
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/challenge-board/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                          className="py-2 rounded-lg border border-amber-200 bg-white text-amber-700 text-sm"
                        >
                          보드
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLeaderDm(challenge)}
                          disabled={leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId)}
                          className="py-2 rounded-lg border border-blue-200 bg-white text-blue-700 text-sm disabled:opacity-50"
                        >
                          {leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId) ? 'DM 중...' : '리더 DM'}
                        </button>
                      </div>

                      {challenge.challenge?.personalQuestEnabled && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                          <p className={`inline-flex px-2 py-0.5 text-[11px] rounded-full border ${statusMeta.color}`}>
                            개인 퀘스트: {statusMeta.label}
                          </p>
                          <p className="text-xs text-gray-700">{proposal?.title || '아직 제출한 개인 퀘스트가 없습니다.'}</p>
                          <p className="text-xs text-gray-600">{statusMeta.nextAction}</p>
                          {proposal?.leaderFeedback && (
                            <p className="text-xs text-rose-700">피드백: {proposal.leaderFeedback}</p>
                          )}
                          {proposal?.status === 'rejected' && (
                            <button
                              type="button"
                              onClick={() => navigate(`/quests?challengeId=${challenge.challengeId}`)}
                              className="mt-1 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white"
                            >
                              퀘스트 보드에서 수정하기
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/challenges/${challenge.challengeId}`)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-white border border-amber-200 text-amber-800"
                        >
                          챌린지 소개
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/quests?challengeId=${challenge.challengeId}`)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white"
                        >
                          퀘스트 보드
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 완료 탭 */}
            {activeTab === 'completed' && (
              <div className="space-y-3">
                {completedChallenges.length === 0 ? (
                  <EmptyState icon="🏆" title="완료한 챌린지가 없어요" description="7일 챌린지를 완주하면 여기에 표시돼요" />
                ) : completedChallenges.map((challenge: any) => (
                  <div key={challenge.userChallengeId || challenge.challengeId} className="bg-white rounded-2xl p-5 border border-emerald-200 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{challenge.challenge?.badgeIcon || challenge.badgeIcon || '🏆'}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{challenge.challenge?.title || challenge.title}</p>
                        <p className="text-xs text-emerald-700 mt-0.5">완주 완료 🎉</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/challenge-feed/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                        className="py-2 rounded-lg border border-primary-200 bg-white text-primary-700 text-sm"
                      >
                        피드
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/challenge-board/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                        className="py-2 rounded-lg border border-amber-200 bg-white text-amber-700 text-sm"
                      >
                        보드
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLeaderDm(challenge)}
                        disabled={leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId)}
                        className="py-2 rounded-lg border border-blue-200 bg-white text-blue-700 text-sm disabled:opacity-50"
                      >
                        {leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId) ? 'DM 중...' : '리더 DM'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 추가기록 링크 */}
        {(extraCountData?.verifications?.length > 0 || extraCountData?.nextToken) && (
          <button
            type="button"
            onClick={() => navigate('/me/records')}
            className="w-full py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 bg-white flex items-center justify-between px-5 hover:border-primary-300 hover:text-primary-600 transition-colors"
          >
            <span>📝 추가기록</span>
            <span className="text-xs text-gray-400">더보기 →</span>
          </button>
        )}

        {/* 실행 가이드 */}
        <section className="bg-white rounded-2xl p-5 border border-gray-200 space-y-3">
          <h2 className="text-lg font-bold text-gray-900">실행 가이드</h2>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• 기본 인증: 오늘 수행한 핵심 퀘스트를 먼저 인증해요.</li>
            <li>• 추가 인증: 같은 날 추가 실천은 '추가 기록'으로 저장되고 필요시 공개 전환할 수 있어요.</li>
            <li>• Day 6 보완: 실패한 Day는 보완 인증(70% 점수)으로 연결할 수 있어요.</li>
          </ul>
        </section>

        {!isLoading && (
          <button
            onClick={() => navigate('/challenges')}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 hover:border-primary-400 hover:text-primary-500 transition-colors font-medium"
          >
            + 새 챌린지 참여하기
          </button>
        )}
      </div>

      <VerificationSheet
        isOpen={showVerification}
        onClose={() => setShowVerification(false)}
        userChallenge={selectedChallenge}
      />
    </div>
  );
};
