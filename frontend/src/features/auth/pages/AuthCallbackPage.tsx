import { useEffect } from 'react';

/**
 * /auth/callback — Cognito Hosted UI 팝업이 소셜 로그인 후 복귀하는 페이지.
 * 팝업 안에서만 동작하며, code/state(또는 error)를 오프너로 전달하고 스스로 닫힌다.
 * 토큰 교환은 오프너(로그인 화면)가 수행한다 — social.ts 참조.
 */
export const AuthCallbackPage = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = {
      type: 'oauth_callback' as const,
      code: params.get('code') ?? undefined,
      state: params.get('state') ?? undefined,
      error: params.get('error') ?? undefined,
      errorDescription: params.get('error_description') ?? undefined,
    };

    if (window.opener) {
      window.opener.postMessage(message, window.location.origin);
      window.close();
      return;
    }
    // 오프너가 없으면(직접 접근·팝업 차단 등) 로그인 화면으로 되돌린다.
    window.location.replace('/login');
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <p className="text-gray-500 text-sm">로그인 처리 중…</p>
    </div>
  );
};
