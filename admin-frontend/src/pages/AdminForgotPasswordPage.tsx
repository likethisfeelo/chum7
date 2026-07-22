import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';

/**
 * 관리자 비밀번호 찾기 — 2단계(재설정 코드 발송 → 코드+새 비밀번호 확정).
 * 백엔드는 user-api POST /auth/login 의 action 분기(forgotPassword / confirmForgotPassword)를 사용한다.
 */
export const AdminForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await apiClient.post('/auth/login', { action: 'forgotPassword', email });
      setStep('confirm');
      setNotice('비밀번호 재설정 코드를 이메일로 발송했습니다.');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '코드 발송에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/login', {
        action: 'confirmForgotPassword',
        email,
        confirmationCode,
        newPassword,
      });
      navigate('/login', { replace: true, state: { notice: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.' } });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || '비밀번호 변경에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">비밀번호 찾기</h1>
        <p className="text-sm text-gray-500 mb-6">
          {step === 'request'
            ? '가입한 이메일로 재설정 코드를 받으세요'
            : '이메일로 받은 6자리 코드와 새 비밀번호를 입력하세요'}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}
        {notice && (
          <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">{notice}</div>
        )}

        {step === 'request' ? (
          <form onSubmit={requestCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="your@email.com"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? '발송 중...' : '재설정 코드 받기'}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">인증 코드 (6자리)</label>
              <input
                type="text"
                inputMode="numeric"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 tracking-widest"
                placeholder="000000"
                minLength={6}
                maxLength={6}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="8자 이상, 대소문자+숫자"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? '변경 중...' : '비밀번호 변경'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('request'); setError(''); setNotice(''); }}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              코드를 다시 받을래요
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-primary-600 font-medium hover:underline">
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
};
