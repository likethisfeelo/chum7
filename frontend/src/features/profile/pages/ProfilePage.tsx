import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { FiSettings, FiLogOut, FiChevronRight } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { resolveChallengeBucket } from '@/features/challenge/utils/challengeLifecycle';


type ChallengeFilter = 'active' | 'preparing' | 'completed';

const getChallengeStatusLabel = (item: any): string => {
  const bucket = resolveChallengeBucket(item);
  if (bucket === 'pending') return '준비중';
  if (bucket === 'completed') return '완주';
  return '진행중';
};

export const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuthStore();
  const [challengeFilter, setChallengeFilter] = useState<ChallengeFilter>('active');


  const { data: profileData } = useQuery({
    queryKey: ['auth-profile'],
    queryFn: async () => {
      const response = await apiClient.get('/auth/profile');
      return response.data?.data?.user;
    },
    retry: false,
  });

  useEffect(() => {
    if (!profileData) return;
    updateUser(profileData);
  }, [profileData, updateUser]);

  const { data: myChallenges } = useQuery({
    queryKey: ['my-challenges', 'all'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=all');
      return response.data.data;
    },
  });

  const challengeItems = myChallenges?.challenges ?? [];

  const summary = useMemo(() => {
    const preparing = challengeItems.filter((item: any) => resolveChallengeBucket(item) === 'pending').length;
    const active = challengeItems.filter((item: any) => resolveChallengeBucket(item) === 'active').length;
    const completed = challengeItems.filter((item: any) => resolveChallengeBucket(item) === 'completed').length;
    const receivedCheer = challengeItems.reduce((acc: number, item: any) => acc + Number(item.cheerCount ?? 0), 0);
    return { preparing, active, completed, receivedCheer };
  }, [challengeItems]);

  const filteredChallenges = useMemo(() => {
    if (challengeFilter === 'preparing') {
      return challengeItems.filter((item: any) => resolveChallengeBucket(item) === 'pending');
    }
    if (challengeFilter === 'active') {
      return challengeItems.filter((item: any) => resolveChallengeBucket(item) === 'active');
    }
    return challengeItems.filter((item: any) => resolveChallengeBucket(item) === 'completed');
  }, [challengeFilter, challengeItems]);

  const handleLogout = () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      logout();
      navigate('/login');
      toast.success('로그아웃 되었습니다');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 pt-12 pb-8 px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center text-4xl">
              {user?.animalIcon || '🐰'}
            </div>
            <div>
              <h1 className="text-white font-bold text-2xl">{user?.name}</h1>
              <p className="text-white/80 text-sm">Lv.{user?.level || 1}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/profile/settings')}
            className="p-2 bg-white/20 rounded-full"
          >
            <FiSettings className="w-6 h-6 text-white" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
              <p className="text-white/70 text-xs mb-1">진행중</p>
              <p className="text-white font-bold text-2xl">{summary.active}</p>
            </div>
            <button
              type="button"
              onClick={() => setChallengeFilter('preparing')}
              className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center border border-white/40"
            >
              <p className="text-white/70 text-xs mb-1">준비중</p>
              <p className="text-white font-bold text-2xl">{summary.preparing}</p>
            </button>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
              <p className="text-white/70 text-xs mb-1">완주</p>
              <p className="text-white font-bold text-2xl">{summary.completed}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
              <p className="text-white/70 text-xs mb-1">응원권</p>
              <p className="text-white font-bold text-2xl">{user?.cheerTickets || 0}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
              <p className="text-white/70 text-xs mb-1">받은응원</p>
              <p className="text-white font-bold text-2xl">{summary.receivedCheer}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <button
              type="button"
              onClick={() => setChallengeFilter('active')}
              className={`py-2 rounded-lg text-sm font-semibold ${challengeFilter === 'active' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}
            >
              진행중
            </button>
            <button
              type="button"
              onClick={() => setChallengeFilter('preparing')}
              className={`py-2 rounded-lg text-sm font-semibold ${challengeFilter === 'preparing' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}
            >
              준비중
            </button>
            <button
              type="button"
              onClick={() => setChallengeFilter('completed')}
              className={`py-2 rounded-lg text-sm font-semibold ${challengeFilter === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
            >
              완주
            </button>
          </div>

          {filteredChallenges.length === 0 ? (
            <p className="text-sm text-gray-500 px-1 py-2">해당 상태의 챌린지가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {filteredChallenges.map((item: any) => (
                <button
                  key={item.userChallengeId}
                  type="button"
                  onClick={() => {
                    const bucket = resolveChallengeBucket(item);
                    if (bucket === 'active') {
                      navigate(`/challenge-feed/${item.challengeId}`);
                      return;
                    }

                    navigate(`/challenges/${item.challengeId}`);
                  }}
                  className="w-full text-left border border-gray-200 rounded-xl p-3 hover:bg-gray-50 transition-colors"
                >
                  <p className="font-semibold text-gray-900">{item.challenge?.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    상태: {getChallengeStatusLabel(item)}
                    {item.startDate ? ` · 시작일: ${item.startDate}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="bg-white rounded-2xl divide-y divide-gray-100 shadow-sm">
          <button
            onClick={() => navigate('/badges')}
            className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏆</span>
              <span className="font-medium text-gray-900">뱃지 컬렉션</span>
            </div>
            <FiChevronRight className="text-gray-400" />
          </button>

          <button
            onClick={() => navigate('/cheer/use-ticket')}
            className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎟</span>
              <span className="font-medium text-gray-900">응원권 사용</span>
            </div>
            <FiChevronRight className="text-gray-400" />
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="w-full py-4 bg-white border border-gray-200 text-gray-700 font-semibold rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-50 shadow-sm"
        >
          <FiLogOut className="w-5 h-5" />
          로그아웃
        </button>
      </div>
    </div>
  );
};
