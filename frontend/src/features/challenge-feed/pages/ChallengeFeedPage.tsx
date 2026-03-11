import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';
import { InlineVerificationForm } from '@/features/verification/components/InlineVerificationForm';
import { getRemedyType, getRemainingRemedyCount } from '@/features/challenge/utils/flowPolicy';

function isSameKstDate(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const toKstKey = (date: Date) => {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const day = String(kst.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return toKstKey(d) === toKstKey(now);
}

export const ChallengeFeedPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: challengeData, isLoading: isChallengeLoading } = useQuery({
    queryKey: ['challenge-feed', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenges/${challengeId}`);
      return response.data?.data;
    },
  });

  const { data: myChallengesData } = useQuery({
    queryKey: ['challenge-feed-my-challenges', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=active');
      return response.data?.data?.challenges || [];
    },
  });

  const userChallenge = useMemo(
    () => (myChallengesData || []).find((item: any) => item.challengeId === challengeId || item.challenge?.challengeId === challengeId),
    [myChallengesData, challengeId],
  );

  const { data: boardData, isLoading: isBoardLoading } = useQuery({
    queryKey: ['challenge-board', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenge-board/${challengeId}`);
      return response.data;
    },
  });

  const { data: verificationData, isLoading: isVerificationsLoading } = useQuery({
    queryKey: ['challenge-feed-verifications', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get('/verifications?isPublic=true&limit=100');
      return response.data?.data?.verifications || [];
    },
  });

  const { data: myVerificationData, isLoading: isMyVerificationsLoading } = useQuery({
    queryKey: ['challenge-feed-my-verifications', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get('/verifications?mine=true&limit=100');
      return response.data?.data?.verifications || [];
    },
  });

  const leaderDmMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/challenge-feed/${challengeId}/leader-dm`);
      return response.data;
    },
    onSuccess: async (res: any) => {
      const threadId = res?.threadId || res?.data?.threadId;
      const deepLink = res?.deepLink || res?.data?.deepLink;
      if (threadId && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(threadId));
      }
      if (typeof deepLink === 'string' && deepLink.startsWith('/messages/')) {
        toast.success('리더 DM 연결 완료');
        navigate(deepLink);
        return;
      }
      toast.success(threadId ? '리더 DM 연결 완료 (threadId 복사됨)' : '리더 DM 연결 완료');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '리더 DM 연결에 실패했습니다');
    },
  });

  const boardSummary = useMemo(() => {
    const blocks = boardData?.blocks || [];
    const textBlock = blocks.find((b: any) => b.type === 'text' && b.content);
    return {
      blockCount: blocks.length,
      summary: textBlock?.content || '아직 챌린지 보드 안내가 등록되지 않았습니다.',
    };
  }, [boardData]);

  const challengeVerifications = useMemo(
    () => (verificationData || []).filter((v: any) => v.challengeId === challengeId),
    [verificationData, challengeId],
  );

  const myChallengeVerifications = useMemo(
    () => (myVerificationData || []).filter((v: any) => v.challengeId === challengeId),
    [myVerificationData, challengeId],
  );

  const todayCompletedCount = useMemo(
    () => challengeVerifications.filter((item: any) => isSameKstDate(item.performedAt || item.createdAt)).length,
    [challengeVerifications],
  );

  const iDidTodayVerification = useMemo(
    () => myChallengeVerifications.some((item: any) => isSameKstDate(item.performedAt || item.createdAt)),
    [myChallengeVerifications],
  );

  const myTotalCount = myChallengeVerifications.length;
  const canCheerNow = iDidTodayVerification;

  if (!challengeId) {
    return <div className="p-6 text-sm text-gray-500">challengeId가 필요합니다.</div>;
  }

  if (isChallengeLoading || isBoardLoading || isVerificationsLoading || isMyVerificationsLoading) {
    return <Loading fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto min-h-screen w-full max-w-3xl bg-gray-50 pb-20 md:border-x md:border-gray-200">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 z-10">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">챌린지 피드</h1>
        </div>

        <div className="p-6 space-y-4">
          <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">{challengeData?.title || '챌린지'}</h2>
            <p className="text-sm text-gray-600 mt-2">{challengeData?.description || '챌린지 소개를 불러오지 못했습니다.'}</p>
          </section>

          <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-900">챌린지 보드 요약</h3>
              <span className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                블록 {boardSummary.blockCount}개
              </span>
            </div>
            <p className="text-sm text-gray-700 line-clamp-3">{boardSummary.summary}</p>
            <button
              type="button"
              onClick={() => navigate(`/challenge-board/${challengeId}`)}
              className="mt-3 text-xs font-semibold text-primary-700"
            >
              보드 전체 보기 →
            </button>
          </section>

          {!iDidTodayVerification && userChallenge && (
            <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">오늘의 인증</h3>
              <InlineVerificationForm
                userChallenge={userChallenge}
                allowedVerificationTypes={challengeData?.allowedVerificationTypes}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['challenge-feed-verifications', challengeId] });
                  queryClient.invalidateQueries({ queryKey: ['challenge-feed-my-verifications', challengeId] });
                }}
              />
            </section>
          )}

          {iDidTodayVerification && (
            <section className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 shadow-sm">
              <h3 className="font-bold text-emerald-800">✅ 오늘 인증 완료!</h3>
              <p className="text-sm text-emerald-700 mt-1">이제 다른 참여자를 응원할 수 있어요.</p>
            </section>
          )}

          {(() => {
            if (!userChallenge) return null;
            const remedyType = getRemedyType(userChallenge.remedyPolicy);
            if (remedyType === 'strict') return null;
            const remaining = getRemainingRemedyCount(userChallenge.remedyPolicy, userChallenge.progress || []);
            const failedDays = (userChallenge.progress || []).filter((p: any) => p.day <= 5 && p.status !== 'success' && !p.remedied);
            const canRemedy = (remaining === null || remaining > 0) && failedDays.length > 0;
            return (
              <section className="bg-white rounded-2xl p-5 border border-purple-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-2">보완 인증</h3>
                <p className="text-xs text-gray-500 mb-3">
                  실패한 Day는 보완 인증(70% 점수)으로 연결할 수 있어요. · 남은 보완 {remaining === null ? '제한 없음' : `${remaining}회`}
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/verification/remedy?userChallengeId=${userChallenge.userChallengeId}`)}
                  disabled={!canRemedy}
                  className="w-full py-2.5 rounded-xl border border-purple-200 text-purple-700 bg-purple-50 disabled:opacity-40 text-sm font-medium hover:bg-purple-100 transition-colors"
                >
                  보완하기 {remaining === null ? '(제한 없음)' : `(${remaining}회 남음)`}
                </button>
              </section>
            );
          })()}

          <section className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500">오늘 인증 완료 인원</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{todayCompletedCount}명</p>
              <p className="text-xs text-gray-500">KST 기준</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500">전체 참여자</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{challengeData?.stats?.totalParticipants || challengeData?.participantCount || 0}명</p>
              <p className="text-xs text-gray-500">챌린지 누적</p>
            </div>
          </section>

          <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-2">내 응원권/기록 현황</h3>
            <p className="text-sm text-gray-700">기간 내 내 인증 기록: <span className="font-semibold">{myTotalCount}회</span></p>
            <p className="text-sm text-gray-700 mt-1">{canCheerNow ? '응원권을 사용할 수 있어요. 피드에서 응원해보세요!' : '인증 후 응원권 기능이 열립니다.'}</p>
          </section>

          <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">인증 피드</h3>
            <div className="space-y-3">
              {challengeVerifications.map((item: any) => (
                <article key={item.verificationId} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500">{item.isAnonymous ? '익명 참여자' : item.userName || '참여자'}</p>
                    <p className="text-xs text-gray-400">Day {item.day || '-'}</p>
                  </div>
                  {item.todayNote && (
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.todayNote}</p>
                  )}
                  {item.verificationType === 'image' && item.imageUrl && (
                    <img src={item.imageUrl} alt="verification" className="mt-2 w-full rounded-lg border border-gray-100" />
                  )}
                  {item.verificationType === 'video' && item.videoUrl && (
                    <video src={item.videoUrl} controls className="mt-2 w-full rounded-lg border border-gray-100" />
                  )}
                  {item.verificationType === 'link' && item.linkUrl && (
                    <a
                      href={item.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex text-sm text-primary-600 underline break-all"
                    >
                      {item.linkUrl}
                    </a>
                  )}
                </article>
              ))}
              {challengeVerifications.length === 0 && (
                <p className="text-sm text-gray-500">아직 올라온 인증 게시물이 없습니다.</p>
              )}
            </div>
          </section>

          <button
            type="button"
            onClick={() => leaderDmMutation.mutate()}
            disabled={leaderDmMutation.isPending}
            className="w-full py-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-semibold disabled:opacity-50"
          >
            {leaderDmMutation.isPending ? 'DM 연결중...' : '리더 DM'}
          </button>
        </div>
      </div>

    </div>
  );
};
