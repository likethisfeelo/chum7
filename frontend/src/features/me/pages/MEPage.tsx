import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { ProgressBar } from '@/shared/components/ProgressBar';
import { VerificationSheet } from '@/features/verification/components/VerificationSheet';
import toast from 'react-hot-toast';

const DAY_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500',
  failed: 'bg-red-300',
  remedy: 'bg-purple-400',
  skipped: 'bg-gray-200',
  pending: 'bg-gray-100 border-2 border-gray-300',
};

const CHALLENGE_TYPE_LABEL: Record<string, string> = {
  leader_only: '리더 퀘스트',
  personal_only: '개인 퀘스트',
  leader_personal: '리더+개인',
  mixed: '혼합형',
};

function getChallengeTypeLabel(challenge: any) {
  const key = String(challenge?.challenge?.challengeType || challenge?.challenge?.type || '').toLowerCase();
  return CHALLENGE_TYPE_LABEL[key] || '일반 챌린지';
}

function getTodayGuide(challenge: any) {
  const type = String(challenge?.challenge?.challengeType || challenge?.challenge?.type || '').toLowerCase();
  if (type === 'leader_only') return '오늘은 리더가 제시한 공통 퀘스트를 인증해요.';
  if (type === 'personal_only') return '오늘은 나만의 개인 퀘스트 실천 내용을 기록해요.';
  if (type === 'leader_personal' || type === 'mixed') return '공통/개인 퀘스트 중 오늘 수행한 항목을 선택해 인증해요.';
  return '오늘 실천한 내용을 인증하고, 필요하면 추가 기록도 남길 수 있어요.';
}

export const MEPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [selectedChallenge, setSelectedChallenge] = useState<any>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [pendingVisibilityId, setPendingVisibilityId] = useState<string | null>(null);
  const [isBulkPublishing, setIsBulkPublishing] = useState(false);
  const [selectedExtraIds, setSelectedExtraIds] = useState<string[]>([]);
  const [failedPublishIds, setFailedPublishIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-challenges'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=active');
      return response.data.data;
    },
  });

  const challenges = data?.challenges || [];

  const { data: myExtraFeedPage, isFetching: isFetchingExtra } = useQuery({
    queryKey: ['verifications', 'mine-extra'],
    queryFn: async () => {
      const response = await apiClient.get('/verifications?mine=true&isExtra=true&limit=10');
      return {
        verifications: response.data.data.verifications || [],
        nextToken: response.data.data.nextToken || null,
      };
    },
  });

  const [extraItems, setExtraItems] = useState<any[]>([]);
  const [extraNextToken, setExtraNextToken] = useState<string | null>(null);

  useEffect(() => {
    setExtraItems(myExtraFeedPage?.verifications || []);
    setExtraNextToken(myExtraFeedPage?.nextToken || null);
  }, [myExtraFeedPage]);


  useEffect(() => {
    const privateIds = extraItems.filter((item: any) => item.isPersonalOnly).map((item: any) => item.verificationId);
    setSelectedExtraIds((prev) => prev.filter((id) => privateIds.includes(id)));
    setFailedPublishIds((prev) => prev.filter((id) => privateIds.includes(id)));
  }, [extraItems]);

  const privateExtraItems = useMemo(
    () => extraItems.filter((item: any) => item.isPersonalOnly),
    [extraItems],
  );

  const selectedPrivateCount = useMemo(
    () => selectedExtraIds.filter((id) => privateExtraItems.some((item: any) => item.verificationId === id)).length,
    [selectedExtraIds, privateExtraItems],
  );

  const loadMoreExtraMutation = useMutation({
    mutationFn: async () => {
      if (!extraNextToken) return null;
      const response = await apiClient.get(`/verifications?mine=true&isExtra=true&limit=10&nextToken=${encodeURIComponent(extraNextToken)}`);
      return {
        verifications: response.data.data.verifications || [],
        nextToken: response.data.data.nextToken || null,
      };
    },
    onSuccess: (data) => {
      if (!data) return;
      setExtraItems((prev) => [...prev, ...data.verifications]);
      setExtraNextToken(data.nextToken);
    },
    onError: () => {
      toast.error('추가 기록을 더 불러오지 못했어요');
    }
  });

  const visibilityMutation = useMutation({
    mutationFn: async (verificationId: string) => {
      setPendingVisibilityId(verificationId);
      await apiClient.patch(`/verifications/${verificationId}/visibility`, { isPersonalOnly: false });
      return verificationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verifications', 'mine-extra'] });
      queryClient.invalidateQueries({ queryKey: ['verifications', 'public'] });
      toast.success('추가 기록을 공개 피드로 전환했어요 🌍');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '공개 전환에 실패했습니다');
    },
    onSettled: () => {
      setPendingVisibilityId(null);
    }
  });


  const publishExtraVisibilityBatch = async (targetIds: string[]) => {
    setIsBulkPublishing(true);
    const results = await Promise.allSettled(
      targetIds.map((verificationId) => apiClient.patch(`/verifications/${verificationId}/visibility`, { isPersonalOnly: false })),
    );

    const successIds = results
      .map((result, idx) => (result.status === 'fulfilled' ? targetIds[idx] : null))
      .filter((id): id is string => Boolean(id));

    const failIds = results
      .map((result, idx) => (result.status === 'rejected' ? targetIds[idx] : null))
      .filter((id): id is string => Boolean(id));

    queryClient.invalidateQueries({ queryKey: ['verifications', 'mine-extra'] });
    queryClient.invalidateQueries({ queryKey: ['verifications', 'public'] });

    setFailedPublishIds(failIds);
    setSelectedExtraIds((prev) => prev.filter((id) => failIds.includes(id)));
    setIsBulkPublishing(false);

    return { successCount: successIds.length, failCount: failIds.length, failIds };
  };

  const handlePublishAllExtras = async () => {
    const pendingItems = extraItems.filter((item: any) => item.isPersonalOnly);
    if (pendingItems.length === 0) {
      toast('이미 모든 추가 기록이 공개 상태예요.', { icon: 'ℹ️' });
      return;
    }

    const confirmed = window.confirm(`비공개 추가 기록 ${pendingItems.length}건을 모두 공개할까요?`);
    if (!confirmed) return;

    const { successCount, failCount } = await publishExtraVisibilityBatch(
      pendingItems.map((item: any) => item.verificationId),
    );

    if (failCount === 0) {
      toast.success(`${successCount}건의 추가 기록을 공개 전환했어요 🌍`);
    } else {
      toast.error(`${successCount}건 성공, ${failCount}건 실패. 실패 항목을 선택해 재시도할 수 있어요.`);
    }
  };



  const handlePublishSelectedExtras = async () => {
    const targetIds = selectedExtraIds.filter((id) => privateExtraItems.some((item: any) => item.verificationId === id));
    if (targetIds.length === 0) {
      toast('공개할 항목을 먼저 선택해주세요.', { icon: 'ℹ️' });
      return;
    }

    const confirmed = window.confirm(`선택한 추가 기록 ${targetIds.length}건을 공개할까요?`);
    if (!confirmed) return;

    const { successCount, failCount } = await publishExtraVisibilityBatch(targetIds);
    if (failCount === 0) {
      toast.success(`선택한 ${successCount}건을 공개 전환했어요 🌍`);
    } else {
      toast.error(`${successCount}건 성공, ${failCount}건 실패. 실패 항목만 남겨두었습니다.`);
    }
  };

  const handleRetryFailedPublishes = async () => {
    if (failedPublishIds.length === 0) {
      toast('재시도할 실패 항목이 없어요.', { icon: 'ℹ️' });
      return;
    }

    const { successCount, failCount } = await publishExtraVisibilityBatch(failedPublishIds);
    if (failCount === 0) {
      toast.success(`실패 항목 ${successCount}건 재시도에 성공했어요 ✅`);
    } else {
      toast.error(`재시도 결과: ${successCount}건 성공, ${failCount}건 실패`);
    }
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

  const handleVerify = (challenge: any) => {
    setSelectedChallenge(challenge);
    setShowVerification(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
        ) : activeChallenges.length === 0 && pendingChallenges.length === 0 ? (
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
            {activeChallenges.map((challenge: any, index: number) => {
              const progress = challenge.progress || [];
              const completedDays = progress.filter((p: any) =>
                ['completed', 'remedy'].includes(p.status)
              ).length;
              const currentDay = challenge.currentDay || 1;
              const todayDone = progress[currentDay - 1]?.status === 'completed';

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
                </motion.div>
              );
            })}

            {pendingChallenges.length > 0 && (
              <section className="bg-white rounded-2xl p-5 border border-amber-200 space-y-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">참여신청/준비중 챌린지</h2>
                  <p className="text-sm text-gray-500">리크루팅/준비중 단계에서는 인증 대신 상세/퀘스트 보드 확인이 가능합니다.</p>
                </div>
                <div className="space-y-2">
                  {pendingChallenges.map((challenge: any) => {
                    const lifecycle = String(challenge.challenge?.lifecycle || 'preparing');
                    const statusLabel = lifecycle === 'recruiting' ? '리크루팅' : '준비중';
                    return (
                      <div key={challenge.userChallengeId} className="border border-amber-100 bg-amber-50 rounded-xl p-3 space-y-2">
                        <p className="font-semibold text-gray-900">{challenge.challenge?.title}</p>
                        <p className="text-xs text-amber-700">
                          시작일: {challenge.startDate || '-'} · 상태: {statusLabel}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/challenges/${challenge.challengeId}`)}
                            className="px-3 py-1.5 text-xs rounded-lg bg-white border border-amber-200 text-amber-800"
                          >
                            챌린지 소개 보기
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/quests?challengeId=${challenge.challengeId}`)}
                            className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white"
                          >
                            퀘스트 보드 보기
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}


        <section className="bg-white rounded-2xl p-5 border border-gray-200 space-y-3">
          <h2 className="text-lg font-bold text-gray-900">실행 가이드</h2>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• 기본 인증: 오늘 수행한 핵심 퀘스트를 먼저 인증해요.</li>
            <li>• 추가 인증: 같은 날 추가 실천은 '추가 기록'으로 저장되고 필요시 공개 전환할 수 있어요.</li>
            <li>• Day 6 보완: 실패한 Day는 보완 인증(70% 점수)으로 연결할 수 있어요.</li>
          </ul>
        </section>


        {extraItems?.length > 0 && (
          <section className="bg-white rounded-2xl p-5 border border-gray-200 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">내 추가 기록</h2>
                <p className="text-sm text-gray-500">추가 인증은 기본적으로 나만 보기로 저장되며, 여기서 공개 전환할 수 있어요.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePublishSelectedExtras}
                  disabled={isBulkPublishing || selectedPrivateCount === 0}
                  className="px-3 py-1.5 text-xs rounded-lg border border-primary-200 text-primary-700 bg-white disabled:opacity-50"
                >
                  선택 공개({selectedPrivateCount})
                </button>
                <button
                  type="button"
                  onClick={handlePublishAllExtras}
                  disabled={isBulkPublishing || privateExtraItems.length === 0}
                  className="px-3 py-1.5 text-xs rounded-lg border border-primary-200 text-primary-700 bg-primary-50 disabled:opacity-50"
                >
                  {isBulkPublishing ? '일괄 전환 중...' : '전체 공개'}
                </button>
              </div>
            </div>

            {failedPublishIds.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-700">공개 전환 실패 {failedPublishIds.length}건이 있어요.</p>
                <button
                  type="button"
                  onClick={handleRetryFailedPublishes}
                  disabled={isBulkPublishing}
                  className="px-2.5 py-1 text-xs rounded-md border border-red-300 text-red-700 bg-white disabled:opacity-50"
                >
                  실패 항목 재시도
                </button>
              </div>
            )}


            <div className="space-y-2">
              {extraItems.map((item: any) => (
                <div key={item.verificationId} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-2">
                    {item.isPersonalOnly ? (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedExtraIds.includes(item.verificationId)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedExtraIds((prev) => Array.from(new Set([...prev, item.verificationId])));
                          } else {
                            setSelectedExtraIds((prev) => prev.filter((id) => id !== item.verificationId));
                          }
                        }}
                      />
                    ) : (
                      <span className="mt-1 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">공개</span>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Day {item.day} · 📝 추가 기록</p>
                      <p className="text-xs text-gray-500 truncate">{item.todayNote || '소감 없음'}</p>
                    </div>
                  </div>

                  {item.isPersonalOnly ? (
                    <button
                      type="button"
                      onClick={() => visibilityMutation.mutate(item.verificationId)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-primary-600 text-white disabled:opacity-50"
                      disabled={visibilityMutation.isPending && pendingVisibilityId === item.verificationId}
                    >
                      {visibilityMutation.isPending && pendingVisibilityId === item.verificationId ? '전환 중...' : '피드 공개'}
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 text-xs rounded-lg bg-green-50 text-green-700 border border-green-200">공개됨</span>
                  )}
                </div>
              ))}
            </div>

            {extraNextToken && (
              <button
                type="button"
                onClick={() => loadMoreExtraMutation.mutate()}
                disabled={loadMoreExtraMutation.isPending || isFetchingExtra}
                className="w-full mt-2 py-2 text-sm rounded-xl border border-gray-200 text-gray-700 disabled:opacity-50"
              >
                {loadMoreExtraMutation.isPending ? '불러오는 중...' : '추가 기록 더보기'}
              </button>
            )}
          </section>
        )}

        {(activeChallenges.length > 0 || pendingChallenges.length > 0) && (
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
