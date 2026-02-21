// frontend/src/features/auth/pages/RegisterPage.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });

  const registerMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiClient.post('/auth/register', data);
      return response.data;
    },
    onSuccess: () => {
      alert('회원가입이 완료되었습니다! 로그인해주세요.');
      navigate('/login');
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || '회원가입에 실패했습니다');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white p-6">
      <div className="max-w-md mx-auto pt-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">회원가입</h1>
          <p className="text-gray-600 mb-8">CHME와 함께 7일을 시작하세요</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이름
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="홍길동"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이메일
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                비밀번호
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="8자 이상 (대소문자, 숫자 포함)"
                required
              />
            </div>

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
            >
              {registerMutation.isPending ? '가입 중...' : '회원가입'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-primary-600 font-medium">
              이미 계정이 있으신가요? 로그인
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// frontend/src/features/feed/pages/FeedPage.tsx
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiHeart } from 'react-icons/fi';
import { format } from 'date-fns';

export const FeedPage = () => {
  const { data: publicFeed } = useQuery({
    queryKey: ['verifications', 'public'],
    queryFn: async () => {
      const response = await apiClient.get('/verifications?isPublic=true&limit=20');
      return response.data.data.verifications;
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <h1 className="text-2xl font-bold text-gray-900">어스 🌍</h1>
        <p className="text-sm text-gray-600">전 세계의 챌린저들과 함께해요</p>
      </div>

      <div className="px-6 py-6 space-y-4">
        {publicFeed?.map((verification: any, index: number) => (
          <motion.div
            key={verification.verificationId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-xl">
                🐰
              </div>
              <div>
                <p className="font-semibold text-gray-900">익명의 챌린저</p>
                <p className="text-sm text-gray-500">
                  Day {verification.day} · {format(new Date(verification.createdAt), 'HH:mm')}
                </p>
              </div>
            </div>

            {verification.imageUrl && (
              <img
                src={verification.imageUrl}
                alt="Verification"
                className="w-full h-64 object-cover rounded-xl mb-4"
              />
            )}

            <p className="text-gray-900 mb-3">{verification.todayNote}</p>

            <div className="flex items-center gap-4 text-sm text-gray-500">
              <button className="flex items-center gap-1 hover:text-primary-500">
                <FiHeart />
                <span>{verification.cheerCount || 0}</span>
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// frontend/src/features/profile/pages/ProfilePage.tsx
import { useAuthStore } from '@/features/auth/store/authStore';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { FiSettings, FiLogOut } from 'react-icons/fi';

export const ProfilePage = () => {
  const { user, logout } = useAuthStore();

  const { data: myChallenges } = useQuery({
    queryKey: ['my-challenges', 'all'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=all');
      return response.data.data;
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-br from-primary-500 to-primary-600 pt-12 pb-8 px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center text-4xl">
              {user?.animalIcon || '🐰'}
            </div>
            <div>
              <h1 className="text-white font-bold text-2xl">{user?.name}</h1>
              <p className="text-white/80">Lv.{user?.level}</p>
            </div>
          </div>
          <button className="p-2 bg-white/20 rounded-full">
            <FiSettings className="w-6 h-6 text-white" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
            <p className="text-white/80 text-sm mb-1">완주</p>
            <p className="text-white font-bold text-2xl">
              {myChallenges?.summary?.completed || 0}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
            <p className="text-white/80 text-sm mb-1">진행중</p>
            <p className="text-white font-bold text-2xl">
              {myChallenges?.summary?.active || 0}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
            <p className="text-white/80 text-sm mb-1">응원권</p>
            <p className="text-white font-bold text-2xl">{user?.cheerTickets || 0}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <button
          onClick={() => {
            if (confirm('로그아웃 하시겠습니까?')) {
              logout();
              window.location.href = '/login';
            }
          }}
          className="w-full py-3 bg-white border-2 border-gray-200 text-gray-700 font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50"
        >
          <FiLogOut />
          로그아웃
        </button>
      </div>
    </div>
  );
};
