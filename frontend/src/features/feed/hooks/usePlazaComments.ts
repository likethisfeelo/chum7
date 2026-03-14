import { useState } from 'react';
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
};

export function usePlazaComments(initialCounts: Record<string, number> = {}) {
  const [stateMap, setStateMap] = useState<Record<string, CommentState>>({});

  function getState(postId: string): CommentState {
    return stateMap[postId] ?? { ...DEFAULT_STATE, count: initialCounts[postId] ?? 0 };
  }

  function update(postId: string, patch: Partial<CommentState>) {
    setStateMap((prev) => ({
      ...prev,
      [postId]: { ...getState(postId), ...patch },
    }));
  }

  async function toggle(postId: string) {
    const state = getState(postId);
    if (state.isOpen) {
      update(postId, { isOpen: false });
      return;
    }

    update(postId, { isOpen: true });
    if (state.comments.length > 0) return;

    update(postId, { isLoading: true });
    try {
      const page = await fetchPlazaCommentsPage({ plazaPostId: postId, limit: 30 });
      const comments = page.comments || [];
      update(postId, {
        comments,
        count: comments.length,
        hasMore: Boolean(page.hasMore),
        nextCursor: page.nextCursor || null,
        isLoading: false,
      });
    } catch {
      update(postId, { isLoading: false });
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
    if (!content) return;

    update(postId, { isSubmitting: true });
    try {
      const created = await createPlazaComment(postId, content);
      if (created) {
        update(postId, {
          comments: [created, ...state.comments],
          count: state.count + 1,
          input: '',
          isSubmitting: false,
        });
      } else {
        update(postId, { isSubmitting: false });
      }
    } catch {
      update(postId, { isSubmitting: false });
    }
  }

  function setInput(postId: string, value: string) {
    update(postId, { input: value });
  }

  return { getState, toggle, loadMore, submit, setInput };
}
