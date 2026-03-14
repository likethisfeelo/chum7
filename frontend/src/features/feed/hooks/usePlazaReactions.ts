import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  dismissRecommendation,
  fetchPlazaRecommendations,
  PlazaPost,
  reactPlazaPost,
} from '@/features/feed/api/plazaApi';

export interface Recommendation {
  id: string;
  title: string;
  reason: string;
  challengeId?: string;
}

const DISMISS_KEY = 'outer-space-recommend-dismiss';
const MAX_EXPOSE_PER_SESSION = 2;
const SUPPRESS_HOURS = 48;

function getDismissMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function setDismissMap(map: Record<string, string>) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
}

function isSuppressed(challengeId?: string): boolean {
  if (!challengeId) return false;
  const map = getDismissMap();
  const until = map[challengeId];
  if (!until) return false;
  const untilDate = new Date(until);
  if (Number.isNaN(untilDate.getTime()) || untilDate.getTime() < Date.now()) {
    delete map[challengeId];
    setDismissMap(map);
    return false;
  }
  return true;
}

export function usePlazaReactions(initialCounts: Record<string, number> = {}) {
  const [countMap, setCountMap] = useState<Record<string, number>>(initialCounts);
  const [reactingIds, setReactingIds] = useState<Record<string, boolean>>({});
  const [exposeCount, setExposeCount] = useState(0);
  const [recommendationsByPost, setRecommendationsByPost] = useState<Record<string, Recommendation[]>>({});

  const reactMutation = useMutation({ mutationFn: reactPlazaPost });
  const recommendMutation = useMutation({ mutationFn: fetchPlazaRecommendations });

  function initCount(postId: string, likeCount: number) {
    setCountMap((prev) => {
      if (prev[postId] !== undefined) return prev;
      return { ...prev, [postId]: likeCount };
    });
  }

  async function react(post: PlazaPost) {
    const postId = post.plazaPostId;
    setReactingIds((prev) => ({ ...prev, [postId]: true }));
    setCountMap((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));

    let reactResponse: any = null;
    try {
      reactResponse = await reactMutation.mutateAsync({ plazaPostId: postId });
      if (typeof reactResponse?.likeCount === 'number') {
        setCountMap((prev) => ({ ...prev, [postId]: reactResponse.likeCount }));
      }
    } catch {
      // optimistic value is acceptable fallback
    }

    setReactingIds((prev) => ({ ...prev, [postId]: false }));

    if (exposeCount >= MAX_EXPOSE_PER_SESSION) return;

    const inline = reactResponse?.recommendation;
    if (inline && !isSuppressed(inline.challengeId)) {
      setRecommendationsByPost((prev) => ({
        ...prev,
        [postId]: [{
          id: String(inline.recommendationId || `rec-inline-${postId}`),
          title: inline.challengeTitle || post.challengeTitle || '추천 챌린지',
          reason: inline.message || '방금 공감한 기록과 연관된 챌린지예요.',
          challengeId: inline.challengeId,
        }],
      }));
      setExposeCount((prev) => prev + 1);
      return;
    }

    try {
      const fetched = await recommendMutation.mutateAsync({ plazaPostId: postId });
      const normalized = (fetched || [])
        .map((item: any, idx: number) => ({
          id: String(item.id || `rec-${idx + 1}`),
          title: item.title || item.challengeTitle || '추천 챌린지',
          reason: item.reason || '관심 반응 기반 추천',
          challengeId: item.challengeId,
        }))
        .filter((item: Recommendation) => !isSuppressed(item.challengeId));

      if (normalized.length > 0) {
        setRecommendationsByPost((prev) => ({ ...prev, [postId]: normalized }));
        setExposeCount((prev) => prev + 1);
      }
    } catch {
      // recommendation fetch failure is non-critical
    }
  }

  async function dismiss(postId: string, item: Recommendation) {
    if (!item.challengeId) return;

    const fallback = new Date(Date.now() + SUPPRESS_HOURS * 60 * 60 * 1000).toISOString();
    const result = await dismissRecommendation(item.id);
    const suppressUntil = result?.suppressUntil || fallback;

    const map = getDismissMap();
    map[item.challengeId] = suppressUntil;
    setDismissMap(map);

    setRecommendationsByPost((prev) => ({
      ...prev,
      [postId]: (prev[postId] || []).filter((r) => r.challengeId !== item.challengeId),
    }));
  }

  return {
    countMap,
    reactingIds,
    recommendationsByPost,
    initCount,
    react,
    dismiss,
  };
}
