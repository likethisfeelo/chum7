import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { apiClient } from "@/lib/api-client";

export type FeedComment = {
  commentId: string;
  displayName: string;
  isLeader: boolean;
  isOwn: boolean;
  content: string;
  createdAt: string;
  parentCommentId?: string | null;
  depth?: number;
  deleted?: boolean;
};

type CommentReaction = { emoji: string; count: number; myReacted: boolean };

// 피드 게시물 리액션과 동일한 노출 목록 (서버 허용 목록의 부분집합)
const COMMENT_REACTION_EMOJIS = ["👍", "❤️", "🔥", "👏", "🎉", "😂"] as const;

const MAX_DEPTH = 5;

/**
 * 인증 게시물 댓글 컴포넌트 — 대댓글(최대 5단) + 댓글별 이모지 리액션.
 * authorMode 로 작성 신원을 고정한다:
 *  - 'participant' (기본): 피드 — 리더 포함 항상 일일 익명명으로 게시
 *  - 'leader': 운영탭 — 챌린지 리더 신원으로 게시 (서버가 리더 여부 재검증)
 */
export function VerificationComments({
  verificationId,
  challengeId,
  canComment,
  challengeEnded,
  notStartedYet = false,
  authorMode = "participant",
}: {
  verificationId: string;
  challengeId: string;
  canComment: boolean;
  challengeEnded: boolean;
  notStartedYet?: boolean;
  authorMode?: "participant" | "leader";
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  // 답글 대상 — 열려 있는 답글 입력창의 부모 댓글
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [replyText, setReplyText] = useState("");
  // 이모지 피커가 열린 댓글
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLeaderMode = authorMode === "leader";

  const { data: comments = [], isLoading } = useQuery<FeedComment[]>({
    queryKey: ["verification-comments", verificationId],
    queryFn: async () => {
      const res = await apiClient.get(
        `/s/challenge-feed/${challengeId}/verifications/${verificationId}/comments`,
      );
      return res.data.data ?? [];
    },
    enabled: open,
    staleTime: 15_000,
  });

  // 댓글 리액션 — 인증 단위 일괄 조회 (commentId → 집계)
  const { data: reactionsByComment = {} } = useQuery<Record<string, CommentReaction[]>>({
    queryKey: ["verification-comment-reactions", verificationId],
    queryFn: async () => {
      const res = await apiClient.get(
        `/s/challenge-feed/${challengeId}/verifications/${verificationId}/comment-reactions`,
      );
      return res.data.data ?? {};
    },
    enabled: open,
    staleTime: 15_000,
  });

  const invalidateComments = () =>
    queryClient.invalidateQueries({ queryKey: ["verification-comments", verificationId] });
  const invalidateReactions = () =>
    queryClient.invalidateQueries({ queryKey: ["verification-comment-reactions", verificationId] });

  const addMutation = useMutation({
    mutationFn: async (vars: { content: string; parentCommentId?: string }) =>
      apiClient.post(
        `/s/challenge-feed/${challengeId}/verifications/${verificationId}/comments`,
        { content: vars.content, authorMode, ...(vars.parentCommentId ? { parentCommentId: vars.parentCommentId } : {}) },
      ),
    onSuccess: (_d, vars) => {
      if (vars.parentCommentId) {
        setReplyText("");
        setReplyTo(null);
      } else {
        setText("");
      }
      invalidateComments();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "댓글 작성에 실패했어요"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) =>
      apiClient.delete(
        `/s/challenge-feed/${challengeId}/verifications/${verificationId}/comments/${commentId}`,
      ),
    onSuccess: () => invalidateComments(),
  });

  const reactionMutation = useMutation({
    mutationFn: async (vars: { commentId: string; emoji: string }) =>
      apiClient.post(
        `/s/challenge-feed/${challengeId}/verifications/${verificationId}/comments/${vars.commentId}/reactions`,
        { emoji: vars.emoji },
      ),
    onSuccess: () => {
      setPickerFor(null);
      invalidateReactions();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "반응에 실패했어요"),
  });

  // 트리 구성 — parentCommentId 기준 children 맵 (작성순 유지)
  const { roots, childrenMap } = useMemo(() => {
    const childrenMap = new Map<string, FeedComment[]>();
    const roots: FeedComment[] = [];
    const ids = new Set(comments.map((c) => c.commentId));
    for (const c of comments) {
      const pid = c.parentCommentId ?? null;
      if (pid && ids.has(pid)) {
        const list = childrenMap.get(pid) ?? [];
        list.push(c);
        childrenMap.set(pid, list);
      } else {
        roots.push(c); // 부모 없는(또는 부모가 조회 밖인) 댓글은 루트로
      }
    }
    return { roots, childrenMap };
  }, [comments]);

  const handleOpen = useCallback(() => {
    setOpen((v) => {
      if (!v) setTimeout(() => inputRef.current?.focus(), 150);
      return !v;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || addMutation.isPending) return;
    addMutation.mutate({ content: trimmed });
  }, [text, addMutation]);

  const handleReplySubmit = useCallback(() => {
    const trimmed = replyText.trim();
    if (!trimmed || !replyTo || addMutation.isPending) return;
    addMutation.mutate({ content: trimmed, parentCommentId: replyTo.commentId });
  }, [replyText, replyTo, addMutation]);

  // 댓글 1개 렌더 (재귀 — depth 들여쓰기, 최대 5단)
  const renderComment = (c: FeedComment): JSX.Element => {
    const displayName = c.displayName || "익명";
    const depth = Math.min(Number(c.depth ?? 1), MAX_DEPTH);
    const children = childrenMap.get(c.commentId) ?? [];
    const reactions = (reactionsByComment[c.commentId] ?? []).filter((r) => r.count > 0);
    const canReply = canComment && depth < MAX_DEPTH && !c.deleted;

    return (
      <div key={c.commentId}>
        <div
          className={depth > 1 ? "border-l-2 border-gray-100 pl-2.5" : undefined}
          style={depth > 1 ? { marginLeft: (depth - 1) * 10 } : undefined}
        >
          <div className="flex items-start gap-2">
            {/* 아바타 */}
            <div
              className={[
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                c.deleted
                  ? "bg-gray-100 text-gray-400"
                  : c.isLeader
                  ? "bg-yellow-100 text-yellow-700"
                  : c.isOwn
                  ? "bg-primary-100 text-primary-700"
                  : "bg-gray-100 text-gray-600",
              ].join(" ")}
            >
              {c.deleted ? "×" : c.isLeader ? "👑" : displayName[0]?.toUpperCase() ?? "?"}
            </div>

            <div className="flex-1 min-w-0">
              {c.deleted ? (
                <p className="text-xs text-gray-400 italic py-0.5">삭제된 댓글입니다</p>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-gray-700">
                      {c.isLeader && <span className="mr-0.5">👑</span>}
                      {displayName}
                    </span>
                    {c.isOwn && (
                      <span className="text-[10px] px-1 rounded bg-primary-100 text-primary-700 font-medium">
                        나
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">
                      {new Date(c.createdAt).toLocaleDateString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </span>
                    {c.isOwn && (
                      <button
                        onClick={() => deleteMutation.mutate(c.commentId)}
                        disabled={deleteMutation.isPending}
                        className="text-[10px] text-gray-400 hover:text-red-500 transition-colors ml-auto"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed break-words">
                    {c.content}
                  </p>

                  {/* 리액션 칩 + 피커 + 답글 */}
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        disabled={reactionMutation.isPending}
                        onClick={() => reactionMutation.mutate({ commentId: c.commentId, emoji: r.emoji })}
                        className={[
                          "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors",
                          r.myReacted
                            ? "bg-primary-50 border-primary-300 text-primary-700"
                            : "bg-white border-gray-200 text-gray-600 hover:border-gray-300",
                        ].join(" ")}
                      >
                        <span>{r.emoji}</span>
                        <span className="font-semibold">{r.count}</span>
                      </button>
                    ))}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPickerFor((cur) => (cur === c.commentId ? null : c.commentId))}
                        className="px-1.5 py-0.5 rounded-full text-[11px] border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
                        aria-label="이모지 반응 추가"
                      >
                        😊+
                      </button>
                      {pickerFor === c.commentId && (
                        <div className="absolute bottom-full left-0 mb-1 z-20 flex gap-0.5 bg-white border border-gray-200 rounded-xl shadow-lg px-1.5 py-1">
                          {COMMENT_REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              disabled={reactionMutation.isPending}
                              onClick={() => reactionMutation.mutate({ commentId: c.commentId, emoji })}
                              className="text-base hover:scale-125 transition-transform px-0.5"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {canReply && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo((cur) => (cur?.commentId === c.commentId ? null : c));
                          setReplyText("");
                        }}
                        className="text-[10px] text-gray-400 hover:text-primary-600 transition-colors ml-1"
                      >
                        답글
                      </button>
                    )}
                  </div>

                  {/* 답글 입력창 */}
                  {replyTo?.commentId === c.commentId && (
                    <div className="flex gap-1.5 mt-1.5">
                      <input
                        autoFocus
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleReplySubmit();
                          }
                        }}
                        placeholder={`${displayName}님에게 답글... (Enter)`}
                        maxLength={300}
                        className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-primary-300 placeholder-gray-400"
                      />
                      <button
                        onClick={handleReplySubmit}
                        disabled={!replyText.trim() || addMutation.isPending}
                        className="px-2.5 py-1.5 rounded-lg bg-primary-500 text-white text-[11px] font-semibold disabled:opacity-40 hover:bg-primary-600 transition-colors"
                      >
                        게시
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 대댓글 */}
        {children.length > 0 && (
          <div className="mt-2 space-y-2">{children.map((child) => renderComment(child))}</div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* 댓글 토글 버튼 */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-primary-600 transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>
          {open && comments.length > 0 ? `댓글 ${comments.length}개` : "댓글"}
        </span>
        {open ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* 댓글 트리 */}
          {isLoading ? (
            <p className="text-xs text-gray-400 py-1">불러오는 중...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-gray-400 py-1 text-center">
              {canComment ? "아직 댓글이 없어요. 첫 댓글을 남겨보세요!" : "아직 댓글이 없어요."}
            </p>
          ) : (
            <div className="space-y-2.5">{roots.map((c) => renderComment(c))}</div>
          )}

          {/* 입력창 or 비활성 안내 */}
          {canComment ? (
            <>
              {isLeaderMode && (
                <p className="text-[11px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-1.5">
                  👑 이 댓글은 <b>챌린지 리더</b>로 표시됩니다.
                </p>
              )}
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={
                    isLeaderMode
                      ? "👑 리더로 응원 댓글 입력... (Enter)"
                      : "응원 댓글 입력... (Enter)"
                  }
                  maxLength={300}
                  className="flex-1 text-xs px-3 py-2 rounded-xl bg-white/70 border border-gray-200 focus:outline-none focus:border-primary-300 placeholder-gray-400"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim() || addMutation.isPending}
                  className="px-3 py-2 rounded-xl bg-primary-500 text-white text-xs font-semibold disabled:opacity-40 hover:bg-primary-600 transition-colors"
                >
                  {addMutation.isPending ? "..." : "게시"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-gray-400 text-center py-1 bg-gray-50/50 rounded-lg">
              {challengeEnded
                ? "챌린지가 종료되어 댓글을 작성할 수 없어요"
                : notStartedYet
                  ? "챌린지가 시작되면 댓글을 남길 수 있어요"
                  : "참여자만 댓글을 작성할 수 있어요"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
