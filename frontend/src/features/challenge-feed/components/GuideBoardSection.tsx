import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { apiClient } from "@/lib/api-client";

/**
 * 챌린지 가이드 게시판 — 리더/매니저가 글을 하나씩 게시, 참여자는 최신순으로 읽는다.
 *  - 공지(📌) 고정 1개는 맨 위
 *  - 안읽은 가이드는 파란 점 표시, 섹션이 보이면 읽음 처리
 *  - 글별 댓글 (일일 익명명 / 리더 👑)
 */

export type GuidePost = {
  postId: string;
  title?: string | null;
  content: string;
  authorRole: "leader" | "manager";
  pinned?: boolean;
  commentCount: number;
  createdAt: string;
  unread?: boolean;
};

type GuideComment = {
  commentId: string;
  displayName: string;
  isLeader: boolean;
  isOwn: boolean;
  content: string;
  createdAt: string;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });

function GuidePostComments({
  challengeId,
  postId,
  canComment,
}: {
  challengeId: string;
  postId: string;
  canComment: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const { data, isLoading } = useQuery<{ comments: GuideComment[] }>({
    queryKey: ["guide-comments", postId],
    queryFn: async () => {
      const res = await apiClient.get(`/s/guide/${challengeId}/posts/${postId}/comments`);
      return res.data.data ?? { comments: [] };
    },
  });
  const comments = data?.comments ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["guide-comments", postId] });
    queryClient.invalidateQueries({ queryKey: ["guide-posts", challengeId] });
  };

  const addMutation = useMutation({
    mutationFn: (content: string) =>
      apiClient.post(`/s/guide/${challengeId}/posts/${postId}/comments`, { content }),
    onSuccess: () => {
      setText("");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "댓글 작성에 실패했어요"),
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) =>
      apiClient.delete(`/s/guide/${challengeId}/posts/${postId}/comments/${commentId}`),
    onSuccess: () => invalidate(),
  });

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      {isLoading ? (
        <p className="text-[11px] text-gray-400">불러오는 중...</p>
      ) : comments.length === 0 ? (
        <p className="text-[11px] text-gray-400">아직 댓글이 없어요.</p>
      ) : (
        comments.map((cm) => (
          <div key={cm.commentId} className="flex items-start gap-1.5">
            <span className="text-[11px] font-semibold text-gray-700 flex-shrink-0">
              {cm.isLeader ? "👑 " : ""}
              {cm.displayName}
            </span>
            <p className="text-[11px] text-gray-600 break-words flex-1">{cm.content}</p>
            <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtDate(cm.createdAt)}</span>
            {cm.isOwn && (
              <button
                type="button"
                onClick={() => deleteMutation.mutate(cm.commentId)}
                disabled={deleteMutation.isPending}
                className="text-[10px] text-gray-400 hover:text-red-500 flex-shrink-0"
              >
                삭제
              </button>
            )}
          </div>
        ))
      )}
      {canComment && (
        <div className="flex gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim() && !addMutation.isPending) addMutation.mutate(text.trim());
              }
            }}
            placeholder="댓글 입력... (Enter)"
            maxLength={300}
            className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white/70 border border-gray-200 focus:outline-none focus:border-primary-300"
          />
          <button
            type="button"
            disabled={!text.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate(text.trim())}
            className="px-2.5 py-1.5 rounded-lg bg-primary-500 text-white text-[11px] font-semibold disabled:opacity-40"
          >
            게시
          </button>
        </div>
      )}
    </div>
  );
}

export function GuideBoardSection({
  challengeId,
  canManage,
  canDelete,
  canComment,
}: {
  challengeId: string;
  /** 글 작성·공지 고정 — 리더/매니저 */
  canManage: boolean;
  /** 글 삭제 — 리더 전용 */
  canDelete: boolean;
  /** 댓글 작성 — 참여자 */
  canComment: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery<{ posts: GuidePost[]; unreadCount: number }>({
    queryKey: ["guide-posts", challengeId],
    queryFn: async () => {
      const res = await apiClient.get(`/s/guide/${challengeId}/posts`);
      return res.data.data ?? { posts: [], unreadCount: 0 };
    },
  });
  const posts = data?.posts ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["guide-posts", challengeId] });

  // 섹션이 보이고 안읽은 글이 있으면 읽음 처리 (점 해제)
  const readMutation = useMutation({
    mutationFn: () => apiClient.post(`/s/guide/${challengeId}/read`),
    onSuccess: () => invalidate(),
  });
  useEffect(() => {
    if (unreadCount > 0 && !readMutation.isPending) {
      readMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/s/guide/${challengeId}/posts`, {
        ...(title.trim() ? { title: title.trim() } : {}),
        content: content.trim(),
      }),
    onSuccess: () => {
      toast.success("가이드를 게시했어요 📣");
      setTitle("");
      setContent("");
      setComposerOpen(false);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "게시에 실패했어요"),
  });

  const pinMutation = useMutation({
    mutationFn: ({ postId, pinned }: { postId: string; pinned: boolean }) =>
      apiClient.put(`/s/guide/${challengeId}/posts/${postId}/pin`, { pinned }),
    onSuccess: (res: any) => {
      toast.success(res?.data?.message || "처리했어요");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "처리에 실패했어요"),
  });

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => apiClient.delete(`/s/guide/${challengeId}/posts/${postId}`),
    onSuccess: () => {
      toast.success("가이드를 삭제했어요");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "삭제에 실패했어요"),
  });

  const visiblePosts = showAll ? posts : posts.slice(0, 4);

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 flex items-center gap-1.5">
          📣 오늘의 가이드
          {unreadCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" aria-label="안읽은 가이드" />
          )}
        </h3>
        {canManage && (
          <button
            type="button"
            onClick={() => setComposerOpen((v) => !v)}
            className="text-xs font-semibold text-primary-600 hover:text-primary-800"
          >
            {composerOpen ? "닫기" : "+ 가이드 쓰기"}
          </button>
        )}
      </div>

      {/* 작성 폼 — 리더/매니저 */}
      {canManage && composerOpen && (
        <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-white/60 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="제목 (선택)"
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="오늘의 가이드·안내 내용을 적어주세요"
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300 resize-none"
          />
          <button
            type="button"
            disabled={!content.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="w-full py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {createMutation.isPending ? "게시 중..." : "게시하기"}
          </button>
        </div>
      )}

      {/* 글 목록 — 공지 먼저, 최신순 */}
      {isLoading ? (
        <p className="text-sm text-gray-400 mt-3">불러오는 중...</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-500 mt-3">
          {canManage ? "아직 가이드가 없어요. 첫 가이드를 게시해보세요!" : "아직 등록된 가이드가 없어요."}
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {visiblePosts.map((p) => (
            <article
              key={p.postId}
              className={`rounded-xl border p-3 ${
                p.pinned ? "border-amber-200 bg-amber-50/60" : "border-gray-100 bg-white/60"
              }`}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                {p.pinned && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800">
                    📌 공지
                  </span>
                )}
                {p.unread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />}
                {p.title && <p className="text-sm font-semibold text-gray-900">{p.title}</p>}
                <span className="ml-auto text-[10px] text-gray-400">
                  {p.authorRole === "manager" ? "🛡️" : "👑"} {fmtDate(p.createdAt)}
                </span>
              </div>
              <p className="text-sm text-gray-700 mt-1 leading-relaxed whitespace-pre-wrap break-words">
                {p.content}
              </p>

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setOpenComments((cur) => (cur === p.postId ? null : p.postId))}
                  className="text-[11px] text-gray-500 hover:text-primary-600"
                >
                  💬 댓글 {p.commentCount > 0 ? p.commentCount : ""}
                </button>
                {canManage && (
                  <button
                    type="button"
                    disabled={pinMutation.isPending}
                    onClick={() => pinMutation.mutate({ postId: p.postId, pinned: !p.pinned })}
                    className="text-[11px] text-gray-400 hover:text-amber-600 ml-auto"
                  >
                    {p.pinned ? "고정 해제" : "📌 공지로 고정"}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm("이 가이드를 삭제할까요?")) deleteMutation.mutate(p.postId);
                    }}
                    className={`text-[11px] text-gray-400 hover:text-rose-500 ${canManage ? "" : "ml-auto"}`}
                  >
                    삭제
                  </button>
                )}
              </div>

              {openComments === p.postId && (
                <GuidePostComments challengeId={challengeId} postId={p.postId} canComment={canComment} />
              )}
            </article>
          ))}
          {posts.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full text-xs font-semibold text-gray-500 hover:text-primary-600 py-1"
            >
              {showAll ? "접기 ▲" : `지난 가이드 ${posts.length - 4}개 더 보기 ▼`}
            </button>
          )}
        </div>
      )}

      {/* 기존 블록형 가이드 문서 링크 유지 */}
      <div className="mt-3 pt-2 border-t border-white/50 flex justify-end">
        <button
          type="button"
          onClick={() => navigate(`/challenge-board/${challengeId}`)}
          className="text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors"
        >
          가이드 문서 전체 보기 →
        </button>
      </div>
    </section>
  );
}
