import { apiClient } from '@/lib/api-client';

export interface PlazaReactionResponse {
  likeCount?: number;
  myReaction?: string | null;
  recommendation?: {
    recommendationId?: string;
    challengeId?: string;
    challengeTitle?: string;
    message?: string;
  };
}

export interface PlazaRecommendation {
  id?: string;
  title?: string;
  challengeTitle?: string;
  reason?: string;
  challengeId?: string;
}

export type PlazaPostType = 'courtyard' | 'recruitment' | 'progress_update' | 'badge_review';

export interface PlazaPost {
  plazaPostId: string;
  postType: PlazaPostType;
  challengeTitle?: string;
  challengeId?: string;
  challengeCategory?: string;
  currentDay?: number;
  content?: string;
  imageUrl?: string;
  createdAt: string;
  likeCount?: number;
  commentCount?: number;
  bookmarkCount?: number;

  hashtag?: string;

  leaderId?: string;
  leaderName?: string;
  leaderMessage?: string;
  leaderCompletionRate?: number;
  leaderTotalParticipants?: number;
  recruitMessage?: string;
  remainingSlots?: number;
  totalSlots?: number;
  daysUntilClose?: number;
  startDate?: string;
}

export interface PlazaFeedResponse {
  posts: PlazaPost[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function fetchPlazaFeed(params: {
  filter: 'all' | 'recruiting' | 'in_progress' | 'completed';
  category?: string;
  hashtag?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<PlazaFeedResponse> {
  const query = new URLSearchParams();
  query.set('filter', params.filter);
  query.set('limit', String(params.limit ?? 20));
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.category) query.set('category', params.category);
  if (params.hashtag) query.set('hashtag', params.hashtag);

  const response = await apiClient.get(`/plaza/feed?${query.toString()}`);
  return response.data?.data || { posts: [], hasMore: false, nextCursor: null };
}

export async function reactPlazaPost(params: {
  plazaPostId: string;
  verificationId?: string;
  challengeId?: string;
}): Promise<PlazaReactionResponse | null> {
  try {
    const response = await apiClient.post(`/plaza/${encodeURIComponent(params.plazaPostId)}/react`, {
      reactionType: 'like',
    });
    return response.data?.data ?? null;
  } catch {
    if (!params.verificationId) return null;
    const fallbackResponse = await apiClient.post('/plaza/reactions', {
      verificationId: params.verificationId,
      challengeId: params.challengeId,
      reactionType: 'like',
    });
    return fallbackResponse.data?.data ?? null;
  }
}

export async function fetchPlazaRecommendations(params: { verificationId?: string; plazaPostId?: string }): Promise<PlazaRecommendation[]> {
  const query = new URLSearchParams();
  if (params.verificationId) query.set('verificationId', params.verificationId);
  if (params.plazaPostId) query.set('plazaPostId', params.plazaPostId);
  query.set('limit', '3');
  const response = await apiClient.get(`/plaza/recommendations?${query.toString()}`);
  return response.data?.data?.recommendations || [];
}

export interface DismissRecommendationResult {
  suppressUntil?: string;
}

export async function dismissRecommendation(recommendationId?: string): Promise<DismissRecommendationResult | null> {
  if (!recommendationId) return null;
  try {
    const response = await apiClient.post(`/recommendations/${encodeURIComponent(recommendationId)}/dismiss`);
    return response.data?.data || null;
  } catch {
    // backward compatibility: ignore if endpoint is not ready yet
    return null;
  }
}


export interface PlazaComment {
  commentId: string;
  animalIcon: string;
  content: string;
  createdAt: string;
  isMine: boolean;
}

export interface PlazaCommentsPage {
  comments: PlazaComment[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function fetchPlazaCommentsPage(params: { plazaPostId: string; cursor?: string | null; limit?: number }): Promise<PlazaCommentsPage> {
  const query = new URLSearchParams();
  query.set('limit', String(params.limit ?? 30));
  if (params.cursor) query.set('cursor', params.cursor);

  const response = await apiClient.get(`/plaza/${encodeURIComponent(params.plazaPostId)}/comments?${query.toString()}`);
  return response.data?.data || { comments: [], hasMore: false, nextCursor: null };
}

export async function fetchPlazaComments(plazaPostId: string): Promise<PlazaComment[]> {
  const page = await fetchPlazaCommentsPage({ plazaPostId });
  return page.comments || [];
}

export async function createPlazaComment(plazaPostId: string, content: string): Promise<PlazaComment | null> {
  const response = await apiClient.post(`/plaza/${encodeURIComponent(plazaPostId)}/comments`, { content });
  return response.data?.data ?? null;
}
