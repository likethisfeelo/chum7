import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

export const EmailVerificationPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [confirmationCode, setConfirmationCode] = useState('');

  const confirmMutation = useMutation({
    mutationFn: async () => apiClient.post('/auth/register', { email, confirmationCode }),
    onSuccess: () => {
      toast.success('이메일 인증이 완료되었습니다. 로그인해주세요.');
      navigate('/login');
    },
    onError: (error: any) => toast.error(error.response?.data?.message || '이메일 인증에 실패했습니다'),
  });

  const resendMutation = useMutation({
    mutationFn: async () => apiClient.post('/auth/register', { action: 'resendConfirmation', email }),
    onSuccess: () => toast.success('인증 코드를 재발송했습니다. 이메일을 확인해주세요.'),
    onError: (error: any) => toast.error(error.response?.data?.message || '인증 코드 재발송에 실패했습니다'),
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex flex-col">
      <div className="flex-1 flex flex-col justify-center p-6 max-w-md mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">이메일 인증</h1>
            <p className="text-gray-600">이메일로 받은 6자리 인증 코드를 입력해주세요</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); confirmMutation.mutate(); }} className="space-y-4">
            <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required className="w-full px-4 py-3 border rounded-xl" placeholder="your@email.com" />
            <input type="text" value={confirmationCode} onChange={(e)=>setConfirmationCode(e.target.value.replace(/\D/g,'').slice(0,6))} required minLength={6} maxLength={6} className="w-full px-4 py-3 border rounded-xl" placeholder="6자리 인증 코드" inputMode="numeric" />
            <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={confirmMutation.isPending} className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold rounded-2xl disabled:opacity-50">
              {confirmMutation.isPending ? '인증 중...' : '이메일 인증 완료'}
            </motion.button>
          </form>

          <button onClick={() => resendMutation.mutate()} disabled={resendMutation.isPending || !email} className="w-full mt-3 py-3 border border-primary-500 text-primary-600 rounded-2xl disabled:opacity-50">
            {resendMutation.isPending ? '재발송 중...' : '인증 코드 재발송'}
          </button>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-primary-600 font-medium">로그인으로 돌아가기</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
