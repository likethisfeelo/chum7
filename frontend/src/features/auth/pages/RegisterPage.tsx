import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

type RegisterFormData = {
  email: string;
  password: string;
  name: string;
};

export const RegisterPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<RegisterFormData>({
    email: '',
    password: '',
    name: '',
  });
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isVerificationStep, setIsVerificationStep] = useState(false);

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const response = await apiClient.post('/auth/register', data);
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.data?.requiresEmailVerification) {
        setIsVerificationStep(true);
        toast.success('인증 코드가 발송되었습니다. 이메일에서 코드를 확인해주세요.');
        return;
      }

      toast.success('회원가입이 완료되었습니다! 로그인해주세요.');
      navigate('/login');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '회원가입에 실패했습니다');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/auth/register', {
        email: formData.email,
        confirmationCode,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('이메일 인증이 완료되었습니다. 로그인해주세요.');
      navigate('/login');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '이메일 인증에 실패했습니다');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isVerificationStep) {
      confirmMutation.mutate();
      return;
    }

    registerMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex flex-col">
      <div className="flex-1 flex flex-col justify-center p-6 max-w-md mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {isVerificationStep ? '이메일 인증' : '회원가입'}
            </h1>
            <p className="text-gray-600">
              {isVerificationStep
                ? '이메일로 받은 6자리 인증 코드를 입력해주세요'
                : 'CHME와 함께 7일을 시작하세요'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isVerificationStep && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    이름 <span className="text-red-500">*</span>
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
                    이메일 <span className="text-red-500">*</span>
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
                    비밀번호 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="8자 이상 (대소문자, 숫자 포함)"
                    required
                    minLength={8}
                  />
                </div>
              </>
            )}

            {isVerificationStep && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  인증 코드 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="6자리 인증 코드"
                  required
                  minLength={6}
                  maxLength={6}
                  inputMode="numeric"
                />
                <p className="text-xs text-gray-500 mt-2">{formData.email} 로 전송된 코드를 입력해주세요.</p>
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={registerMutation.isPending || confirmMutation.isPending}
              className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold text-lg rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
            >
              {registerMutation.isPending && '가입 중...'}
              {confirmMutation.isPending && '인증 중...'}
              {!registerMutation.isPending && !confirmMutation.isPending && (isVerificationStep ? '이메일 인증 완료' : '회원가입')}
            </motion.button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">
              이미 계정이 있으신가요? 로그인
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
