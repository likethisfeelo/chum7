import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { personalFeedApi } from '../api/personalFeedApi';

export function InviteLandingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isError } = useQuery({
    queryKey: ['invite-resolve', token],
    queryFn: () => personalFeedApi.resolveInviteToken(token!),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (data?.ownerId) {
      navigate(`/personal-feed/${data.ownerId}`, {
        replace: true,
        state: { fromInvite: true },
      });
    }
  }, [data, navigate]);

  useEffect(() => {
    if (isError) {
      setErrorMsg('초대 링크가 만료되었거나 유효하지 않아요');
    }
  }, [isError]);

  if (errorMsg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl mb-4">🔗</p>
        <p className="text-base font-semibold text-gray-800 mb-2">링크를 사용할 수 없어요</p>
        <p className="text-sm text-gray-500 mb-6">{errorMsg}</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2 bg-primary-500 text-white rounded-full text-sm font-semibold"
        >
          홈으로
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <p className="text-3xl mb-4 animate-pulse">🔗</p>
      <p className="text-sm text-gray-500">초대 링크 확인 중...</p>
    </div>
  );
}
