import { apiClient } from '@/lib/api-client';

export interface FriendCandidate {
  user: { userId: string; displayName: string };
  reason: { sharedChallenges: number; interactionLevel: 'frequent' | 'regular' | 'occasional' };
}
export interface FriendItem {
  userId: string;
  displayName: string;
  since: string | null;
}
export interface FriendRequestItem {
  fromUserId: string;
  displayName: string;
  requestedAt: string | null;
}

export async function fetchCandidates(): Promise<FriendCandidate[]> {
  const res = await apiClient.get('/u/friends/candidates');
  return res.data?.data?.candidates ?? [];
}
export async function fetchFriends(): Promise<FriendItem[]> {
  const res = await apiClient.get('/u/friends');
  return res.data?.data?.friends ?? [];
}
export async function fetchFriendRequests(): Promise<FriendRequestItem[]> {
  const res = await apiClient.get('/u/friends/requests');
  return res.data?.data?.requests ?? [];
}
// 신청 = 수락. 상대가 이미 신청했으면 서버가 자동으로 친구로 만든다(상호 신청).
export async function sendFriendRequest(toUserId: string): Promise<void> {
  await apiClient.post('/u/friends/requests', { toUserId });
}
export async function removeFriend(otherUserId: string): Promise<void> {
  await apiClient.delete(`/u/friends/${encodeURIComponent(otherUserId)}`);
}

export interface RelationshipSummary {
  sharedChallengeCount: number;
  commentCount: number;
  reactionCount: number;
  cheerCount: number;
  plazaMeetCount: number;
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  myConsent: { timeline: boolean; fullContent: boolean };
  counterpartConsent: { timeline: boolean; fullContent: boolean };
}
export interface ArchiveEntry {
  interactionId: string;
  occurredAt: string;
  interactionType: string;
  contextType: string;
  contextId: string | null;
  actorIsMine: boolean;
  actorDisplayName: string | null;
  hasSource: boolean;
}

export async function fetchRelationshipSummary(userId: string): Promise<RelationshipSummary> {
  const res = await apiClient.get(`/u/friends/${encodeURIComponent(userId)}/relationship-summary`);
  return res.data?.data;
}
export async function setArchiveConsent(
  userId: string,
  patch: { timeline?: boolean; fullContent?: boolean },
): Promise<void> {
  await apiClient.post(`/u/friends/${encodeURIComponent(userId)}/archive-consent`, patch);
}
export async function fetchArchiveTimeline(userId: string): Promise<ArchiveEntry[]> {
  const res = await apiClient.get(`/u/friends/${encodeURIComponent(userId)}/archive`);
  return res.data?.data?.timeline ?? [];
}
