import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { FiSettings, FiLogOut, FiChevronRight } from 'react-icons/fi';
import toast from 'react-hot-toast';

export const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const { data: myChallenges } = useQuery({
    queryKey: ['my-challenges', 'all'],
    queryFn: async () => {
      const response = await apiClient.get('/user/challenges?status=all');
      return response.data.data;
    },
  });

  const handleLogout = () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      logout();
      navigate('/login');
      toast.success('로그아웃 되었습니다');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 프로필 헤더 */}
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

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">완주</p>
            <p className="text-white font-bold text-2xl">
              {myChallenges?.summary?.completed || 0}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">진행중</p>
            <p className="text-white font-bold text-2xl">
              {myChallenges?.summary?.active || 0}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">응원권</p>
            <p className="text-white font-bold text-2xl">{user?.cheerTickets || 0}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-4">
        {/* 메뉴 */}
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

        {/* 로그아웃 */}
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
