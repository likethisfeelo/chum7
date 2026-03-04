import { FormEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiArrowLeft } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';

export const ChallengeBoardPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');

  const { data: boardData, isLoading: isBoardLoading } = useQuery({
    queryKey: ['challenge-board-page', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenge-board/${challengeId}`);
      return response.data;
    },
  });

  const { data: commentsData, isLoading: isCommentsLoading } = useQuery({
    queryKey: ['challenge-board-page-comments', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenge-board/${challengeId}/comments?limit=30`);
      return response.data;
    },
  });

  const submitCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiClient.post(`/challenge-board/${challengeId}/comments`, { content });
      return response.data;
    },
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['challenge-board-page-comments', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-board-comments', challengeId] });
      toast.success('댓글이 등록되었어요');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '댓글 등록에 실패했습니다');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const content = comment.trim();
    if (!content) return;
    submitCommentMutation.mutate(content);
  };

  if (!challengeId) return <div className="p-6 text-sm text-gray-500">challengeId가 필요합니다.</div>;
  if (isBoardLoading || isCommentsLoading) return <Loading fullScreen />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">챌린지 보드</h1>
      </div>

      <div className="p-6 space-y-4">
        <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-3">리더 가이드</h2>
          <div className="space-y-3">
            {(boardData?.blocks || []).map((block: any) => {
              if (block.type === 'image') {
                return <img key={block.id} src={block.url} alt="board" className="w-full rounded-xl border border-gray-100" />;
              }
              if (block.type === 'link') {
                return (
                  <a key={block.id} href={block.url} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 underline break-all">
                    {block.label || block.url}
                  </a>
                );
              }
              return (
                <div key={block.id} className={`rounded-xl p-3 ${block.type === 'quote' ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'}`}>
                  {block.type === 'quote' && <p className="text-xs text-amber-700 mb-1">💬 {block.authorName || '익명'}</p>}
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{block.content}</p>
                </div>
              );
            })}
            {(!boardData?.blocks || boardData.blocks.length === 0) && <p className="text-sm text-gray-500">아직 보드 가이드가 없습니다.</p>}
          </div>
        </section>

        <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">댓글</h3>
          <form onSubmit={handleSubmit} className="space-y-2 mb-4">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="응원/질문을 남겨보세요"
              className="w-full min-h-[84px] px-3 py-2 rounded-xl border border-gray-200 resize-none"
              maxLength={1000}
            />
            <button
              type="submit"
              disabled={submitCommentMutation.isPending || !comment.trim()}
              className="w-full py-2.5 rounded-xl bg-primary-600 text-white font-semibold disabled:opacity-50"
            >
              {submitCommentMutation.isPending ? '등록 중...' : '댓글 등록'}
            </button>
          </form>

          <div className="space-y-2">
            {(commentsData?.comments || []).map((item: any) => (
              <div key={item.commentId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">{item.dailyAnonymousId || '익명-000'}</p>
                  {item.isQuoted && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">인용됨</span>}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.content}</p>
              </div>
            ))}
            {(!commentsData?.comments || commentsData.comments.length === 0) && (
              <p className="text-sm text-gray-500">첫 댓글을 남겨보세요.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
