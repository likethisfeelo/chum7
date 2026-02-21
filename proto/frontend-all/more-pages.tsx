// frontend/src/features/challenge/pages/ChallengeDetailPage.tsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiUsers, FiTrendingUp, FiClock } from 'react-icons/fi';
import { Button } from '@/shared/components/Button';
import { Loading } from '@/shared/components/Loading';

export const ChallengeDetailPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const joinMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/challenges/${challengeId}/join`, {
        startDate: new Date().toISOString().split('T')[0],
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      alert('챌린지 참여 완료! 오늘부터 시작하세요 🎉');
      navigate('/me');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '참여에 실패했습니다');
    },
  });

  if (isLoading) return <Loading fullScreen />;
  if (!challenge) return <div>챌린지를 찾을 수 없습니다</div>;

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

      {/* 챌린지 정보 */}
      <div className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl flex items-center justify-center text-4xl">
              {challenge.badgeIcon}
            </div>
            <div className="flex-1">
              <span className="inline-block px-3 py-1 bg-primary-100 text-primary-700 text-xs font-medium rounded-full mb-2">
                {challenge.category}
              </span>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {challenge.title}
              </h2>
              <p className="text-sm text-gray-600">
                <FiClock className="inline w-4 h-4 mr-1" />
                목표 시간: {challenge.targetTime}
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
                <span className="text-2xl">⭐</span>
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
                  <span className="text-sm font-medium text-gray-600 w-12">
                    Day {day.day}
                  </span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-400 to-primary-600"
                      style={{ width: `${day.completionRate}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 w-12 text-right">
                    {Math.round(day.completionRate)}%
                  </span>
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
          className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl p-6 border border-primary-200 mb-6"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-3">획득 뱃지</h3>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-sm">
              {challenge.badgeIcon}
            </div>
            <div>
              <p className="font-bold text-gray-900">{challenge.badgeName}</p>
              <p className="text-sm text-gray-600">
                "나는 {challenge.identityKeyword} 사람"
              </p>
            </div>
          </div>
        </motion.div>

        {/* 참여 버튼 */}
        <Button
          fullWidth
          size="lg"
          onClick={() => joinMutation.mutate()}
          loading={joinMutation.isPending}
        >
          챌린지 시작하기 🚀
        </Button>

        <p className="text-xs text-gray-500 text-center mt-4">
          💡 오늘부터 7일간 진행됩니다
        </p>
      </div>
    </div>
  );
};

// frontend/src/features/verification/pages/RemedyPage.tsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import { Button } from '@/shared/components/Button';
import { Textarea } from '@/shared/components/Textarea';

export const RemedyPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userChallengeId = searchParams.get('userChallengeId');
  const originalDay = searchParams.get('day');
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    reflectionNote: '',
    todayNote: '',
    tomorrowPromise: '',
  });

  const { data: userChallenge } = useQuery({
    queryKey: ['user-challenge', userChallengeId],
    queryFn: async () => {
      const response = await apiClient.get(`/challenges/my`);
      const challenges = response.data.data.challenges;
      return challenges.find((c: any) => c.userChallengeId === userChallengeId);
    },
    enabled: !!userChallengeId,
  });

  const remedyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiClient.post('/verifications/remedy', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      alert(data.message);
      navigate('/me');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '보완 인증에 실패했습니다');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    remedyMutation.mutate({
      userChallengeId,
      originalDay: parseInt(originalDay || '0'),
      reflectionNote: formData.reflectionNote,
      todayNote: formData.todayNote,
      tomorrowPromise: formData.tomorrowPromise,
      completedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">Day 6 보완하기</h1>
      </div>

      <div className="p-6">
        {/* 안내 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200 mb-6"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
              <FiRefreshCw className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-purple-900 mb-1">Day 6 보완 기회</h3>
              <p className="text-sm text-purple-700">
                실패는 끝이 아니라 배움의 기회입니다
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-purple-700">
            <p>✅ Day {originalDay}을 다시 실천하세요</p>
            <p>✅ 기본 점수의 70% (7점)를 받아요</p>
            <p>✅ 보너스 응원권 1장을 받아요</p>
          </div>
        </motion.div>

        {/* 챌린지 정보 */}
        {userChallenge && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{userChallenge.challenge?.badgeIcon}</span>
              <div>
                <h3 className="font-bold text-gray-900">
                  {userChallenge.challenge?.title}
                </h3>
                <p className="text-sm text-gray-500">
                  Day {originalDay} 보완
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 보완 폼 */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Textarea
            label="회고: 왜 실패했나요? 📝"
            value={formData.reflectionNote}
            onChange={(e) => setFormData({ ...formData, reflectionNote: e.target.value })}
            placeholder="솔직하게 되돌아보세요. 어떤 이유로 인증을 놓쳤나요?"
            rows={4}
            required
            helperText="최소 10자 이상 작성해주세요"
          />

          <Textarea
            label="오늘의 실천 ✨"
            value={formData.todayNote}
            onChange={(e) => setFormData({ ...formData, todayNote: e.target.value })}
            placeholder="오늘은 어떻게 다시 실천했나요?"
            rows={4}
            required
          />

          <Textarea
            label="다짐 (선택)"
            value={formData.tomorrowPromise}
            onChange={(e) => setFormData({ ...formData, tomorrowPromise: e.target.value })}
            placeholder="앞으로 어떻게 할 건가요?"
            rows={3}
          />

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={remedyMutation.isPending}
          >
            다시 연결하기 ✨
          </Button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          💡 보완 인증은 Day 6에만 가능합니다
        </p>
      </div>
    </div>
  );
};

// frontend/src/features/profile/pages/BadgeCollectionPage.tsx
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';

export const BadgeCollectionPage = () => {
  const navigate = useNavigate();

  const { data: badges, isLoading } = useQuery({
    queryKey: ['my-badges'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=completed');
      return response.data.data.challenges;
    },
  });

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
        <div>
          <h1 className="text-lg font-bold">뱃지 컬렉션</h1>
          <p className="text-sm text-gray-600">
            {badges?.length || 0}개의 뱃지를 모았어요
          </p>
        </div>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : badges && badges.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {badges.map((badge: any, index: number) => (
              <motion.div
                key={badge.userChallengeId}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <div className="w-full aspect-square bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl flex items-center justify-center mb-4">
                  <span className="text-5xl">{badge.challenge?.badgeIcon}</span>
                </div>
                <h3 className="font-bold text-gray-900 text-center mb-1 line-clamp-2">
                  {badge.challenge?.badgeName}
                </h3>
                <p className="text-xs text-gray-500 text-center">
                  {format(new Date(badge.startDate), 'yyyy.MM.dd')} 완주
                </p>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-center text-primary-600 font-medium">
                    {badge.score}점 · {badge.consecutiveDays}일 연속
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🏆"
            title="아직 뱃지가 없어요"
            description="챌린지를 완주하고 첫 뱃지를 획득하세요!"
            action={{
              label: '챌린지 시작하기',
              onClick: () => navigate('/challenges'),
            }}
          />
        )}
      </div>
    </div>
  );
};
