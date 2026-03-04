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

export async function reactPlazaPost(params: {
  plazaPostId: string;
  verificationId: string;
  challengeId?: string;
}): Promise<PlazaReactionResponse | null> {
  try {
    const response = await apiClient.post(`/plaza/${encodeURIComponent(params.plazaPostId)}/react`, {
      reactionType: 'like',
    });
    return response.data?.data ?? null;
  } catch {
    const fallbackResponse = await apiClient.post('/plaza/reactions', {
      verificationId: params.verificationId,
      challengeId: params.challengeId,
      reactionType: 'like',
    });
    return fallbackResponse.data?.data ?? null;
  }
}

export async function fetchPlazaRecommendations(verificationId: string): Promise<PlazaRecommendation[]> {
  const response = await apiClient.get(`/plaza/recommendations?verificationId=${encodeURIComponent(verificationId)}&limit=3`);
  return response.data?.data?.recommendations || [];
}
