import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/authStore';
import { fetchSocialConfig, openSocialLogin } from '../social';

/** provider별 버튼 라벨·스타일 */
const PROVIDER_META: Record<string, { label: string; className: string; mark: string }> = {
  google: {
    label: 'Google로 계속하기',
    className: 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
    mark: 'G',
  },
  kakao: {
    label: '카카오로 시작하기',
    className: 'bg-[#FEE500] border border-[#FEE500] text-[#191600] hover:brightness-95',
    mark: 'K',
  },
};

/**
 * 소셜 로그인 버튼 묶음. 서버 config에서 활성 제공자를 받아 해당 버튼만 노출한다.
 * (롤아웃 전이면 providers가 비어 아무것도 렌더하지 않음 → 안전)
 * 로그인/회원가입 화면에서 공통으로 사용한다.
 */
export const SocialLoginButtons = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pending, setPending] = useState<string | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ['social-config'],
    queryFn: fetchSocialConfig,
    staleTime: Infinity,
    retry: false,
  });

  if (!cfg?.enabled || cfg.providers.length === 0) return null;

  const handle = async (provider: string) => {
    setPending(provider);
    try {
      const { idToken, refreshToken } = await openSocialLogin(provider);
      // 소셜 최초 로그인 시 프로필 멱등 생성 + user 획득 (idToken으로 인증)
      const { data } = await apiClient.post(
        '/u/bootstrap',
        {},
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      const user = data?.data?.user;
      if (!user) {
        toast.error('로그인 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      // idToken은 aud=clientId라 API Gateway JWT 인증 통과 (이메일/비밀번호 경로와 동일)
      setAuth(user, idToken, refreshToken);
      navigate('/me');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '소셜 로그인에 실패했습니다.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">또는</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <div className="space-y-3">
        {cfg.providers.map((provider) => {
          const meta = PROVIDER_META[provider];
          if (!meta) return null;
          return (
            <button
              key={provider}
              type="button"
              onClick={() => handle(provider)}
              disabled={pending !== null}
              className={`w-full py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${meta.className}`}
            >
              <span className="w-5 h-5 rounded-full bg-black/5 flex items-center justify-center text-xs font-bold">
                {meta.mark}
              </span>
              {pending === provider ? '로그인 중…' : meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
