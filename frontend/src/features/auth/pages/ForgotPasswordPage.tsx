import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

export const ForgotPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isCodeStep, setIsCodeStep] = useState(false);

  const requestMutation = useMutation({
    mutationFn: async () => apiClient.post('/auth/login', { action: 'forgotPassword', email }),
    onSuccess: () => {
      setIsCodeStep(true);
      toast.success('비밀번호 재설정 코드가 발송되었습니다.');
    },
    onError: (error: any) => toast.error(error.response?.data?.message || '코드 발송에 실패했습니다'),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => apiClient.post('/auth/login', {
      action: 'confirmForgotPassword',
      email,
      confirmationCode,
      newPassword,
    }),
    onSuccess: () => {
      toast.success('비밀번호가 변경되었습니다. 로그인해주세요.');
      navigate('/login');
    },
    onError: (error: any) => toast.error(error.response?.data?.message || '비밀번호 변경에 실패했습니다'),
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex flex-col">
      <div className="flex-1 flex flex-col justify-center p-6 max-w-md mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">비밀번호 찾기</h1>
            <p className="text-gray-600">{isCodeStep ? '코드 인증 후 비밀번호를 변경하세요' : '가입한 이메일로 재설정 코드를 받으세요'}</p>
          </div>

          {!isCodeStep ? (
            <form onSubmit={(e) => { e.preventDefault(); requestMutation.mutate(); }} className="space-y-4">
              <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required className="w-full px-4 py-3 border rounded-xl" placeholder="your@email.com" />
              <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={requestMutation.isPending} className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold rounded-2xl disabled:opacity-50">
                {requestMutation.isPending ? '발송 중...' : '재설정 코드 받기'}
              </motion.button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); confirmMutation.mutate(); }} className="space-y-4">
              <input type="text" value={confirmationCode} onChange={(e)=>setConfirmationCode(e.target.value.replace(/\D/g,'').slice(0,6))} required minLength={6} maxLength={6} className="w-full px-4 py-3 border rounded-xl" placeholder="6자리 코드" inputMode="numeric" />
              <input type="password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} required className="w-full px-4 py-3 border rounded-xl" placeholder="새 비밀번호 (8자 이상, 대소문자+숫자)" minLength={8} />
              <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={confirmMutation.isPending} className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold rounded-2xl disabled:opacity-50">
                {confirmMutation.isPending ? '변경 중...' : '비밀번호 변경'}
              </motion.button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="text-primary-600 font-medium">로그인으로 돌아가기</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
