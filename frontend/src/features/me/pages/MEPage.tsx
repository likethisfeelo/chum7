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

export const MEPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [selectedChallenge, setSelectedChallenge] = useState<any>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [pendingVisibilityId, setPendingVisibilityId] = useState<string | null>(null);
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
                      <p className="text-sm text-primary-600">Day {currentDay} / 7</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">{challenge.score || 0}</p>
                      <p className="text-xs text-gray-500">점수</p>
                    </div>
                  </div>

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


        {extraItems?.length > 0 && (
          <section className="bg-white rounded-2xl p-5 border border-gray-200 space-y-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">내 추가 기록</h2>
              <p className="text-sm text-gray-500">추가 인증은 기본적으로 나만 보기로 저장되며, 여기서 공개 전환할 수 있어요.</p>
            </div>

            <div className="space-y-2">
              {extraItems.map((item: any) => (
                <div key={item.verificationId} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Day {item.day} · 📝 추가 기록</p>
                    <p className="text-xs text-gray-500 truncate">{item.todayNote || '소감 없음'}</p>
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
