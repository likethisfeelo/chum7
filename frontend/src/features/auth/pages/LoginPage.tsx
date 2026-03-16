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
      const user = data?.data?.user;
      // idToken은 aud=clientId를 포함하여 API Gateway JWT 인증 통과, accessToken은 aud 없음
      const accessToken = data?.data?.tokens?.idToken || data?.data?.tokens?.accessToken;
      const refreshToken = data?.data?.tokens?.refreshToken;

      if (!user || !accessToken || !refreshToken) {
        toast.error('로그인 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      setAuth(user, accessToken, refreshToken);
      navigate('/me');
    },
    onError: (error: any) => {
      const serverError = error.response?.data?.error;
      const message = error.response?.data?.message || '로그인에 실패했습니다';

      if (serverError === 'USER_NOT_CONFIRMED' || serverError === 'EMAIL_NOT_VERIFIED') {
        toast.error(message);
        navigate(`/verify-email?email=${encodeURIComponent(formData.email)}`);
        return;
      }

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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-400 to-primary-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white font-bold text-2xl">ME</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">CHME</h1>
            <p className="text-gray-500 text-sm">Challenge Earth with ME</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">이메일</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">비밀번호</label>
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

          <div className="mt-6 text-center space-y-2">
            <Link to="/forgot-password" className="block text-sm text-primary-600 hover:text-primary-700">비밀번호를 잊으셨나요?</Link>
            <Link to="/verify-email" className="block text-sm text-gray-600 hover:text-gray-800">이메일 인증/재발송</Link>
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
