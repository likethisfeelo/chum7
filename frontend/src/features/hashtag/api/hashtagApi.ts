import { apiClient } from '@/lib/api-client';
import type { PlazaPost } from '@/features/feed/api/plazaApi';

export interface HashtagMeta {
  hashtag: string;
  registeredAt: string;
  postCount: number;
  followerCount: number;
  creator: { animalIcon: string } | null;
}

export interface HashtagPostsPage {
  posts: PlazaPost[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface HashtagFollowStatus {
  followed: boolean;
  followId: string | null;
}

export interface HashtagSummary {
  hashtag: string;
  registeredAt: string;
  postCount: number;
  creatorAnimalIcon: string | null;
}

export const hashtagApi = {
  async getLatest(limit = 7): Promise<HashtagSummary[]> {
    const r = await apiClient.get(`/hashtags?limit=${limit}`);
    return r.data.data?.hashtags ?? [];
  },

  async getMeta(tag: string): Promise<HashtagMeta> {
    const r = await apiClient.get(`/hashtags/${encodeURIComponent(tag)}`);
    return r.data.data;
  },

  async getPosts(tag: string, cursor?: string | null, limit = 20): Promise<HashtagPostsPage> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    const r = await apiClient.get(`/hashtags/${encodeURIComponent(tag)}/posts?${q}`);
    return r.data.data ?? { posts: [], hasMore: false, nextCursor: null };
  },

  async getFollowStatus(tag: string): Promise<HashtagFollowStatus> {
    const r = await apiClient.get(`/hashtags/${encodeURIComponent(tag)}/follow/status`);
    return r.data.data;
  },

  async follow(tag: string): Promise<{ followId: string; followedAt: string }> {
    const r = await apiClient.post(`/hashtags/${encodeURIComponent(tag)}/follow`);
    return r.data.data;
  },

  async unfollow(tag: string): Promise<void> {
    await apiClient.delete(`/hashtags/${encodeURIComponent(tag)}/follow`);
  },
};
