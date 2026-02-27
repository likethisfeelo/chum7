import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { ProgressBar } from '@/shared/components/ProgressBar';
import { VerificationSheet } from '@/features/verification/components/VerificationSheet';

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

  const { data, isLoading } = useQuery({
    queryKey: ['my-challenges'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=active');
      return response.data.data;
    },
  });

  const challenges = data?.challenges || [];

  const preparingChallenges = useMemo(
    () => challenges.filter((challenge: any) => challenge.phase === 'preparing'),
    [challenges],
  );
  const activeChallenges = useMemo(
    () => challenges.filter((challenge: any) => challenge.phase !== 'preparing'),
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
        ) : activeChallenges.length === 0 && preparingChallenges.length === 0 ? (
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

            {preparingChallenges.length > 0 && (
              <section className="bg-white rounded-2xl p-5 border border-amber-200 space-y-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">준비중인 챌린지</h2>
                  <p className="text-sm text-gray-500">챌린지 시작 전 미리 상세를 확인하고 준비해보세요.</p>
                </div>
                <div className="space-y-2">
                  {preparingChallenges.map((challenge: any) => (
                    <button
                      key={challenge.userChallengeId}
                      type="button"
                      onClick={() => navigate(`/challenges/${challenge.challengeId}`)}
                      className="w-full text-left border border-amber-100 bg-amber-50 rounded-xl p-3 hover:bg-amber-100 transition-colors"
                    >
                      <p className="font-semibold text-gray-900">{challenge.challenge?.title}</p>
                      <p className="text-xs text-amber-700 mt-1">
                        시작일: {challenge.startDate || '-'} · 상태: 준비중
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {(activeChallenges.length > 0 || preparingChallenges.length > 0) && (
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
