import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

export const LoginPage = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [formData, setFormData] = useState({ email: '', password: '' });

  const loginMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiClient.post('/auth/login', data);
      return response.data;
    },
    onSuccess: (data) => {
      const { user, tokens } = data.data;
      setAuth(user, tokens.accessToken, tokens.refreshToken);
      navigate('/me');
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || '이메일 또는 비밀번호를 확인해주세요';
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex flex-col">
      <div className="flex-1 flex flex-col justify-center p-6 max-w-md mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* 로고 */}
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white font-bold text-2xl">ME</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">CHME</h1>
            <p className="text-gray-500 text-sm">Challenge Earth with ME</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="비밀번호를 입력하세요"
                required
              />
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold text-lg rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
            >
              {loginMutation.isPending ? '로그인 중...' : '로그인'}
            </motion.button>
          </form>

          {/* 소셜 로그인 (준비 중) */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">또는</span>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <button
                className="w-full py-3 bg-[#FEE500] text-gray-900 font-semibold rounded-2xl flex items-center justify-center gap-3 hover:bg-[#FFDE00] transition-colors opacity-60 cursor-not-allowed"
                disabled
                title="준비 중입니다"
              >
                <span className="text-xl">💬</span>
                카카오로 로그인 (준비 중)
              </button>
              <button
                className="w-full py-3 bg-white border-2 border-gray-200 text-gray-700 font-semibold rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors opacity-60 cursor-not-allowed"
                disabled
                title="준비 중입니다"
              >
                <span className="text-xl">🔍</span>
                구글로 로그인 (준비 중)
              </button>
            </div>
          </div>

          <div className="mt-8 text-center space-y-3">
            <Link to="/register" className="block text-primary-600 font-medium hover:text-primary-700">
              계정이 없으신가요? 회원가입
            </Link>
            <Link to="/" className="block text-sm text-gray-500 hover:text-gray-700">
              서비스 소개 보기
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
