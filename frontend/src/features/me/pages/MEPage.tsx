import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { InlineVerificationForm } from '@/features/verification/components/InlineVerificationForm';
import { getChallengeTypeLabel as getChallengeTypeLabelByType } from '@/features/challenge/utils/flowPolicy';
import toast from 'react-hot-toast';

type METab = 'active' | 'pending' | 'completed';

const DAY_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500',
  success: 'bg-green-500',
  failed: 'bg-red-300',
  remedy: 'bg-purple-400',
  skipped: 'bg-gray-200',
  pending: 'bg-gray-100 border-2 border-gray-300',
};

function getChallengeTypeLabel(challenge: any) {
  const type = String(challenge?.challenge?.challengeType || challenge?.challenge?.type || 'leader_personal');
  return getChallengeTypeLabelByType(type);
}

// personalTarget → 분 단위 변환 (0~1439)
function getPersonalTargetMinutes(challenge: any): number {
  const target = challenge.personalTarget;
  if (!target) return 12 * 60; // 기본 정오
  let hour = Number(target.hour12 || 12);
  const minute = Number(target.minute || 0);
  const meridiem = String(target.meridiem || 'AM').toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getTimeDistance(challenge: any): number {
  return Math.abs(getPersonalTargetMinutes(challenge) - getCurrentMinutes());
}

function formatPersonalTarget(challenge: any): string {
  const target = challenge.personalTarget;
  if (!target) return '';
  const hour = String(target.hour12 || 12).padStart(2, '0');
  const minute = String(target.minute || 0).padStart(2, '0');
  const meridiem = target.meridiem === 'PM' ? '오후' : '오전';
  return `${meridiem} ${hour}:${minute}`;
}

function isTodayVerified(challenge: any): boolean {
  const progress = challenge.progress || [];
  const currentDay = challenge.currentDay || 1;
  const status = progress[currentDay - 1]?.status;
  return status === 'success' || status === 'remedy';
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

  // 미인증 챌린지: personalTarget 시간 기준으로 현재와 가장 가까운 순 정렬
  const unverifiedChallenges = useMemo(
    () => activeChallenges
      .filter((c: any) => !isTodayVerified(c) && (c.currentDay || 1) <= 7)
      .sort((a: any, b: any) => getTimeDistance(a) - getTimeDistance(b)),
    [activeChallenges],
  );

  // 오늘 인증 완료 챌린지
  const verifiedTodayChallenges = useMemo(
    () => activeChallenges.filter((c: any) => isTodayVerified(c) || (c.currentDay || 1) > 7),
    [activeChallenges],
  );

  const TAB_CONFIG: { key: METab; label: string; count: number }[] = [
    { key: 'active', label: '진행중', count: activeChallenges.length },
    { key: 'pending', label: '준비중', count: pendingChallenges.length },
    { key: 'completed', label: '완료', count: completedChallenges.length },
  ];

  const isEmpty = activeChallenges.length === 0 && pendingChallenges.length === 0 && completedChallenges.length === 0;

  // 대표 인증 챌린지 (최상단 인라인 폼)
  const primaryUnverified = unverifiedChallenges[0] ?? null;
  const otherUnverified = unverifiedChallenges.slice(1);

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
                ) : (
                  <>
                    {/* 섹션 1: 오늘 인증 (가장 가까운 시간대 → InlineVerificationForm) */}
                    {primaryUnverified && (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl p-4 shadow-sm border border-primary-100"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-100 px-2 py-0.5 rounded-full">
                              📌 지금 인증하기
                            </span>
                            <span className="text-xs text-gray-500">
                              {getChallengeTypeLabel(primaryUnverified)}
                            </span>
                          </div>
                          {primaryUnverified.personalTarget && (
                            <span className="text-xs text-gray-400">
                              목표 {formatPersonalTarget(primaryUnverified)}
                            </span>
                          )}
                        </div>
                        <InlineVerificationForm userChallenge={primaryUnverified} />
                      </motion.div>
                    )}

                    {/* 섹션 2: 다른 미인증 챌린지 */}
                    {otherUnverified.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">오늘 인증 예정</p>
                        {otherUnverified.map((challenge: any, index: number) => (
                          <motion.div
                            key={challenge.userChallengeId}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 flex items-center gap-3"
                          >
                            <span className="text-2xl flex-shrink-0">{challenge.challenge?.badgeIcon || '🎯'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate">{challenge.challenge?.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-primary-600">Day {challenge.currentDay || 1} / 7</span>
                                {challenge.personalTarget && (
                                  <span className="text-xs text-gray-400">목표 {formatPersonalTarget(challenge)}</span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate(`/challenge-feed/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                              className="flex-shrink-0 px-3 py-2 bg-primary-500 text-white text-xs font-semibold rounded-xl hover:bg-primary-600 transition-colors"
                            >
                              인증하기
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {/* 섹션 3: 인증 완료 챌린지 */}
                    {verifiedTodayChallenges.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">인증 완료</p>
                        {verifiedTodayChallenges.map((challenge: any, index: number) => {
                          const progress = challenge.progress || [];
                          const currentDay = challenge.currentDay || 1;
                          const challengeId = challenge.challengeId || challenge.challenge?.challengeId;

                          return (
                            <motion.div
                              key={challenge.userChallengeId}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                              onClick={() => navigate(`/challenge-feed/${challengeId}`)}
                              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer active:bg-gray-50 hover:border-primary-200 transition-colors"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">{challenge.challenge?.badgeIcon || '🎯'}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-900 text-sm truncate">{challenge.challenge?.title}</p>
                                  <p className="text-xs text-green-600 mt-0.5">✅ 오늘 인증 완료 · Day {currentDay} / 7</p>
                                </div>
                                <span className="text-2xl font-bold text-gray-800 flex-shrink-0">{challenge.score || 0}
                                  <span className="text-xs font-normal text-gray-400 ml-0.5">점</span>
                                </span>
                              </div>

                              {/* Day 1~7 트래커 */}
                              <div className="flex gap-1.5">
                                {Array.from({ length: 7 }, (_, i) => {
                                  const dayStatus = progress[i]?.status || (i < currentDay - 1 ? 'skipped' : 'pending');
                                  return (
                                    <div
                                      key={i}
                                      className={`flex-1 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${DAY_STATUS_COLORS[dayStatus] || 'bg-gray-100'}`}
                                    >
                                      <span className={dayStatus === 'pending' ? 'text-gray-400' : 'text-white'}>{i + 1}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {/* 모두 인증 완료 상태 */}
                    {unverifiedChallenges.length === 0 && verifiedTodayChallenges.length === 0 && (
                      <EmptyState icon="🏃" title="진행 중인 챌린지가 없어요" description="챌린지에 참여하고 오늘부터 시작해보세요" />
                    )}
                  </>
                )}
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

                      <button
                        type="button"
                        onClick={() => navigate(`/challenge-feed/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                        className="w-full py-2.5 rounded-xl border border-primary-200 text-primary-700 bg-primary-50 text-sm font-medium hover:bg-primary-100 transition-colors"
                      >
                        챌린지 피드 →
                      </button>

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
                        <button
                          type="button"
                          onClick={() => handleLeaderDm(challenge)}
                          disabled={leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-blue-200 bg-white text-blue-700 disabled:opacity-50"
                        >
                          {leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId) ? 'DM 중...' : '리더 DM'}
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
                    <button
                      type="button"
                      onClick={() => navigate(`/challenge-feed/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                      className="w-full py-2.5 rounded-xl border border-primary-200 text-primary-700 bg-primary-50 text-sm font-medium hover:bg-primary-100 transition-colors"
                    >
                      챌린지 피드 →
                    </button>
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
            <li>• 보완: 실패한 Day는 보완 인증(70% 점수)으로 연결할 수 있어요.</li>
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
    </div>
  );
};
