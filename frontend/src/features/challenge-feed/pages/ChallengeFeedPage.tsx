import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';

export const ChallengeFeedPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();

  const { data: challengeData, isLoading: isChallengeLoading } = useQuery({
    queryKey: ['challenge-feed', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenges/${challengeId}`);
      return response.data?.data;
    },
  });

  const { data: boardData, isLoading: isBoardLoading } = useQuery({
    queryKey: ['challenge-board', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenge-board/${challengeId}`);
      return response.data;
    },
  });

  const { data: commentsData, isLoading: isCommentsLoading } = useQuery({
    queryKey: ['challenge-board-comments', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenge-board/${challengeId}/comments?limit=5`);
      return response.data;
    },
  });

  const leaderDmMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/challenge-feed/${challengeId}/leader-dm`);
      return response.data;
    },
    onSuccess: async (res: any) => {
      const threadId = res?.threadId || res?.data?.threadId;
      if (threadId && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(threadId));
        toast.success('리더 DM 연결 완료 (threadId 복사됨)');
      } else {
        toast.success('리더 DM 연결 완료');
      }
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
      summary: textBlock?.content || '아직 리더 가이드가 등록되지 않았습니다.',
    };
  }, [boardData]);

  if (!challengeId) {
    return <div className="p-6 text-sm text-gray-500">challengeId가 필요합니다.</div>;
  }

  if (isChallengeLoading || isBoardLoading || isCommentsLoading) {
    return <Loading fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
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
            <h3 className="font-bold text-gray-900">리더 가이드 요약</h3>
            <span className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
              블록 {boardSummary.blockCount}개
            </span>
          </div>
          <p className="text-sm text-gray-700 line-clamp-3">{boardSummary.summary}</p>
        </section>

        <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-2">최근 댓글</h3>
          <div className="space-y-2">
            {(commentsData?.comments || []).slice(0, 3).map((comment: any) => (
              <div key={comment.commentId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs text-gray-500 mb-1">{comment.dailyAnonymousId || '익명-000'}</p>
                <p className="text-sm text-gray-800">{comment.content}</p>
              </div>
            ))}
            {(!commentsData?.comments || commentsData.comments.length === 0) && (
              <p className="text-sm text-gray-500">아직 댓글이 없습니다.</p>
            )}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => leaderDmMutation.mutate()}
            disabled={leaderDmMutation.isPending}
            className="py-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-semibold disabled:opacity-50"
          >
            {leaderDmMutation.isPending ? 'DM 연결중...' : '리더 DM'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/quests?challengeId=${challengeId}`)}
            className="py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 font-semibold"
          >
            챌린지 보드
          </button>
        </div>
      </div>
    </div>
  );
};
