import { useCallback, useRef, useState } from "react";
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
};

/**
 * 인증 게시물 댓글 컴포넌트.
 * authorMode 로 작성 신원을 고정한다:
 *  - 'participant' (기본): 피드 — 리더 포함 항상 일일 익명명으로 게시
 *  - 'leader': 운영탭 — 챌린지 리더 신원으로 게시 (서버가 리더 여부 재검증)
 */
export function VerificationComments({
  verificationId,
  challengeId,
  canComment,
  challengeEnded,
  authorMode = "participant",
}: {
  verificationId: string;
  challengeId: string;
  canComment: boolean;
  challengeEnded: boolean;
  authorMode?: "participant" | "leader";
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
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

  const addMutation = useMutation({
    mutationFn: async (content: string) =>
      apiClient.post(
        `/s/challenge-feed/${challengeId}/verifications/${verificationId}/comments`,
        { content, authorMode },
      ),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["verification-comments", verificationId] });
    },
    onError: () => toast.error("댓글 작성에 실패했어요"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) =>
      apiClient.delete(
        `/s/challenge-feed/${challengeId}/verifications/${verificationId}/comments/${commentId}`,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["verification-comments", verificationId] }),
  });

  const handleOpen = useCallback(() => {
    setOpen((v) => {
      if (!v) setTimeout(() => inputRef.current?.focus(), 150);
      return !v;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || addMutation.isPending) return;
    addMutation.mutate(trimmed);
  }, [text, addMutation]);

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
          {/* 댓글 목록 */}
          {isLoading ? (
            <p className="text-xs text-gray-400 py-1">불러오는 중...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-gray-400 py-1 text-center">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>
          ) : (
            <div className="space-y-2.5">
              {comments.map((c) => {
                /* 게시물과 동일하게 항상 일일 활동명(수달N)/리더 표시. 본인은 "나" 배지로만 구분 */
                const displayName = c.displayName || "익명";

                return (
                  <div key={c.commentId} className="flex items-start gap-2">
                    {/* 아바타 */}
                    <div
                      className={[
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                        c.isLeader
                          ? "bg-yellow-100 text-yellow-700"
                          : c.isOwn
                          ? "bg-primary-100 text-primary-700"
                          : "bg-gray-100 text-gray-600",
                      ].join(" ")}
                    >
                      {c.isLeader ? "👑" : displayName[0]?.toUpperCase() ?? "?"}
                    </div>

                    <div className="flex-1 min-w-0">
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
                    </div>
                  </div>
                );
              })}
            </div>
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
                : "참여자만 댓글을 작성할 수 있어요"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
