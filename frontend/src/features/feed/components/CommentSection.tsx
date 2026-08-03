import type { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';
import { ReportButton } from './ReportModal';

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

  if (state.error) {
    return (
      <div className="mt-3 rounded-xl border border-gray-200 p-3 bg-gray-50">
        <p className="text-xs text-gray-500">{state.error}</p>
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
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-800">{comment.displayName}</span>
                {comment.isMine && (
                  <span className="text-[10px] px-1 rounded bg-primary-100 text-primary-700 font-medium">
                    나
                  </span>
                )}
                <span className="flex-1" />
                {comment.isMine ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('이 댓글을 삭제할까요?')) hook.remove(postId, comment);
                    }}
                    className="shrink-0 text-gray-300 hover:text-red-500 text-sm leading-none"
                    aria-label="댓글 삭제"
                    title="삭제"
                  >
                    ✕
                  </button>
                ) : (
                  <ReportButton
                    target={{
                      targetType: 'comment',
                      targetId: comment.commentId,
                      plazaPostId: postId,
                      commentCreatedAt: (comment as { createdAt?: string }).createdAt ?? null,
                    }}
                    className="shrink-0 text-gray-300 hover:text-red-500 text-xs leading-none"
                  />
                )}
              </div>
              <p className="mt-0.5 break-words whitespace-pre-wrap">{comment.content}</p>
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
          {state.isFetchingMore ? '불러오는 중...' : '댓글 더보기'}
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
          className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-primary-400"
          maxLength={300}
        />
        <button
          type="button"
          onClick={() => { void hook.submit(postId); }}
          disabled={state.isSubmitting || !state.input.trim()}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-primary-200 bg-primary-50 text-primary-700 disabled:opacity-40"
        >
          {state.isSubmitting ? '등록 중...' : '등록'}
        </button>
      </div>

      {state.submitError && (
        <p className="mt-1.5 text-xs text-red-500">{state.submitError}</p>
      )}
    </div>
  );
}
