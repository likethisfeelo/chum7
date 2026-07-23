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
export interface ArchivePage {
  timeline: ArchiveEntry[];
  nextCursor: string | null;
}
export async function fetchArchiveTimeline(
  userId: string,
  cursor?: string,
): Promise<ArchivePage> {
  const res = await apiClient.get(`/u/friends/${encodeURIComponent(userId)}/archive`, {
    params: cursor ? { cursor } : undefined,
  });
  return {
    timeline: res.data?.data?.timeline ?? [],
    nextCursor: res.data?.data?.nextCursor ?? null,
  };
}

// 단계 E: 실콘텐츠 참조 — 양쪽 fullContent 동의 + 글로벌 플래그 필요(아니면 403).
export interface ArchiveItemRef {
  interactionType: string;
  contextType: string;
  contextId: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  sourcePostId: string | null;
  occurredAt: string;
}
export async function fetchArchiveItem(
  userId: string,
  interactionId: string,
  occurredAt: string,
): Promise<ArchiveItemRef> {
  const res = await apiClient.get(
    `/u/friends/${encodeURIComponent(userId)}/archive/${encodeURIComponent(interactionId)}`,
    { params: { occurredAt } },
  );
  return res.data?.data;
}

/** 참조 → 기존 화면 딥링크(원본 보기). 매핑 없으면 null. */
export function sourceDeepLink(ref: ArchiveItemRef): string | null {
  const cid = ref.contextId ?? undefined;
  switch (ref.contextType) {
    case 'plaza':
      return '/plaza';
    case 'board':
      return cid ? `/challenge-board/${cid}` : null;
    case 'verification':
      return cid ? `/challenge-feed/${cid}` : null;
    default:
      return null;
  }
}
