import type { usePlazaComments } from '@/features/feed/hooks/usePlazaComments';

const ANONYMITY_KEY = 'outer-space-anonymous-mode';

function anonNumber(icon: string): number {
  const sum = [...icon].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (sum % 90) + 10; // 10–99
}

type CommentHook = ReturnType<typeof usePlazaComments>;

interface Props {
  postId: string;
  hook: CommentHook;
}

export function CommentSection({ postId, hook }: Props) {
  const state = hook.getState(postId);
  const isAnonymous = localStorage.getItem(ANONYMITY_KEY) === 'true';

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
            <div key={comment.commentId} className="text-xs text-gray-700 flex items-start gap-1">
              <span className="font-medium shrink-0">
                {isAnonymous ? `${comment.animalIcon} 익명` : `아무개${anonNumber(comment.animalIcon)}`}
              </span>
              <span className="flex-1 break-all">{comment.content}</span>
              {comment.isMine && (
                <span className="shrink-0 text-primary-700 font-medium">나</span>
              )}
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
