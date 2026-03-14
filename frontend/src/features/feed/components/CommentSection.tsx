import type { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';

type CommentHook = ReturnType<typeof usePlazaComments>;

interface Props {
  postId: string;
  hook: CommentHook;
}

export function CommentSection({ postId, hook }: Props) {
  const state = hook.getState(postId);

  if (state.isLoading) {
    return (
      <div className="mt-3 rounded-xl border border-gray-200 p-3 bg-gray-50 space-y-2">
        <div className="animate-pulse bg-gray-200 rounded h-3 w-3/4" />
        <div className="animate-pulse bg-gray-200 rounded h-3 w-1/2" />
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3 bg-gray-50">
      <div className="space-y-2">
        {state.comments.length === 0 ? (
          <p className="text-xs text-gray-500">아직 댓글이 없어요.</p>
        ) : (
          state.comments.map((comment) => (
            <div key={comment.commentId} className="text-xs text-gray-700">
              <span className="font-medium mr-1">{comment.animalIcon} 익명</span>
              <span>{comment.content}</span>
              {comment.isMine && <span className="ml-1 text-primary-700">(내 댓글)</span>}
            </div>
          ))
        )}
      </div>

      {state.hasMore && (
        <button
          type="button"
          onClick={() => { void hook.loadMore(postId); }}
          disabled={state.isFetchingMore}
          className="mt-2 text-xs text-gray-600 underline disabled:opacity-50"
        >
          {state.isFetchingMore ? '댓글 불러오는 중...' : '댓글 더보기'}
        </button>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          value={state.input}
          onChange={(e) => hook.setInput(postId, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void hook.submit(postId);
            }
          }}
          placeholder="댓글 달기..."
          className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white"
          maxLength={300}
        />
        <button
          type="button"
          onClick={() => { void hook.submit(postId); }}
          disabled={state.isSubmitting}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-primary-200 bg-primary-50 text-primary-700 disabled:opacity-50"
        >
          {state.isSubmitting ? '등록 중...' : '등록'}
        </button>
      </div>
    </div>
  );
}
