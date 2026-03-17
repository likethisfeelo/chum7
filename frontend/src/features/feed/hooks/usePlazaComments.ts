import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  createPlazaComment,
  fetchPlazaCommentsPage,
  PlazaComment,
} from '@/features/feed/api/plazaApi';

interface CommentState {
  comments: PlazaComment[];
  isOpen: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  input: string;
  hasMore: boolean;
  nextCursor: string | null;
  isFetchingMore: boolean;
  count: number;
  error: string | null;
  submitError: string | null;
}

const DEFAULT_STATE: CommentState = {
  comments: [],
  isOpen: false,
  isLoading: false,
  isSubmitting: false,
  input: '',
  hasMore: false,
  nextCursor: null,
  isFetchingMore: false,
  count: 0,
  error: null,
  submitError: null,
};

export function usePlazaComments(initialCounts: Record<string, number> = {}) {
  const [stateMap, setStateMap] = useState<Record<string, CommentState>>({});
  // initialCounts는 렌더 중 변할 수 있으므로 ref로 최신값 유지
  const initialCountsRef = useRef(initialCounts);
  initialCountsRef.current = initialCounts;

  function getDefaultState(postId: string): CommentState {
    return { ...DEFAULT_STATE, count: initialCountsRef.current[postId] ?? 0 };
  }

  function getState(postId: string): CommentState {
    return stateMap[postId] ?? getDefaultState(postId);
  }

  // 핵심 수정: setStateMap 콜백 내에서 prev[postId]를 사용하여 stale closure 방지
  function update(postId: string, patch: Partial<CommentState>) {
    setStateMap((prev) => {
      const current = prev[postId] ?? getDefaultState(postId);
      return { ...prev, [postId]: { ...current, ...patch } };
    });
  }

  async function toggle(postId: string) {
    const state = getState(postId);
    if (state.isOpen) {
      update(postId, { isOpen: false });
      return;
    }

    // isOpen: true 먼저 설정 — stale closure 수정 덕분에 이후 update가 덮어쓰지 않음
    update(postId, { isOpen: true, error: null });
    if (state.comments.length > 0) return;

    update(postId, { isLoading: true });
    try {
      const page = await fetchPlazaCommentsPage({ plazaPostId: postId, limit: 30 });
      const comments = page.comments || [];
      update(postId, {
        comments,
        // count는 서버 총계를 유지하되, 아직 열기 전이라 initialCount를 쓴 경우
        // 실제 로드된 개수가 더 크다면 그것을 사용 (hasMore=true면 실제 총계는 더 많음)
        count: Math.max(initialCountsRef.current[postId] ?? 0, comments.length),
        hasMore: Boolean(page.hasMore),
        nextCursor: page.nextCursor || null,
        isLoading: false,
      });
    } catch (e: any) {
      const status = e?.response?.status;
      update(postId, {
        isLoading: false,
        error: status === 401 ? '로그인 후 댓글을 볼 수 있어요.' : '댓글을 불러오지 못했어요.',
      });
    }
  }

  async function loadMore(postId: string) {
    const state = getState(postId);
    if (!state.hasMore || state.isFetchingMore) return;

    update(postId, { isFetchingMore: true });
    try {
      const page = await fetchPlazaCommentsPage({
        plazaPostId: postId,
        cursor: state.nextCursor || undefined,
        limit: 30,
      });
      const newComments = page.comments || [];
      update(postId, {
        comments: [...state.comments, ...newComments],
        hasMore: Boolean(page.hasMore),
        nextCursor: page.nextCursor || null,
        isFetchingMore: false,
      });
    } catch {
      update(postId, { isFetchingMore: false });
    }
  }

  async function submit(postId: string) {
    const state = getState(postId);
    const content = state.input.trim();
    if (!content || state.isSubmitting) return;

    update(postId, { isSubmitting: true, submitError: null });
    try {
      const created = await createPlazaComment(postId, content);
      if (created) {
        // POST 응답에 isMine이 없으면 true로 채움 (내가 방금 달았으므로)
        const commentWithMine: PlazaComment = { ...created, isMine: true };
        update(postId, {
          comments: [commentWithMine, ...state.comments],
          count: state.count + 1,
          input: '',
          isSubmitting: false,
        });
      } else {
        update(postId, { isSubmitting: false, submitError: '댓글 등록에 실패했어요.' });
        toast.error('댓글 등록에 실패했어요.');
      }
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        status === 401
          ? '로그인이 필요해요.'
          : status === 400
            ? '댓글 내용을 확인해주세요.'
            : '댓글 등록에 실패했어요.';
      update(postId, { isSubmitting: false, submitError: msg });
      toast.error(msg);
    }
  }

  function setInput(postId: string, value: string) {
    update(postId, { input: value, submitError: null });
  }

  return { getState, toggle, loadMore, submit, setInput };
}
