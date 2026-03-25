import { useRef, useCallback, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Loading } from '@/shared/components/Loading';
import {
  personalFeedApi,
  FeedProfile,
  FeedAchievements,
  VerificationFeedItem,
  ChallengeFeedItem,
  PersonalPost,
  SavedPostItem,
} from '../api/personalFeedApi';

type FeedTab = 'verifications' | 'challenges' | 'achievements' | 'posts';

const TAB_CONFIG: { key: FeedTab; label: string }[] = [
  { key: 'verifications', label: '인증' },
  { key: 'challenges', label: '챌린지' },
  { key: 'achievements', label: '업적' },
  { key: 'posts', label: '자유' },
];

const BADGE_META: Record<string, { icon: string; name: string; desc: string }> = {
  '3-day-streak': { icon: '🔥', name: '3일 연속', desc: '3일 연속 퀘스트 완료' },
  '7-day-master': { icon: '⭐', name: '7일 마스터', desc: '7일 연속 퀘스트 완료' },
};

const LEADER_BADGE_META: Record<string, { icon: string; name: string; desc: string }> = {
  'leader-debut': { icon: '🎖️', name: '리더 데뷔', desc: '챌린지 1회 이상 완료 운영' },
  'leader-active': { icon: '🏆', name: '활동 리더', desc: '완주율 50%+ 챌린지 3회 이상' },
  'leader-expert': { icon: '👑', name: '전문 리더', desc: '누적 참여자 50명 이상' },
  'leader-streak': { icon: '🔗', name: '연속 리더', desc: '3개월 이상 연속 챌린지 개설' },
};

const VERIFICATION_TYPE_ICON: Record<string, string> = {
  image: '📸',
  text: '📝',
  link: '🔗',
  video: '🎬',
};

const BUCKET_STATE_META = {
  completed: { label: '완주', color: 'bg-green-100 text-green-700 border-green-200' },
  active: { label: '진행중', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  preparing: { label: '준비중', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  gave_up: { label: '포기', color: 'bg-gray-100 text-gray-500 border-gray-200' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Follow Button ────────────────────────────────────────────────────
function FollowButton({ profile, targetUserId, effectiveLayer }: { profile: FeedProfile; targetUserId: string; effectiveLayer: number }) {
  const queryClient = useQueryClient();

  const requestMutation = useMutation({
    mutationFn: () => personalFeedApi.sendFollowRequest(targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-profile', targetUserId] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => personalFeedApi.unfollow(targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-profile', targetUserId] });
    },
  });

  const { followStatus } = profile;
  const currentLayer = effectiveLayer;

  // layer -1 = blocked
  if (currentLayer === -1) return null;

  if (followStatus === 'accepted') {
    return (
      <button
        onClick={() => unfollowMutation.mutate()}
        disabled={unfollowMutation.isPending}
        className="px-4 py-1.5 rounded-full text-xs font-semibold border border-white/30 text-white/80 hover:bg-white/10 transition-colors"
      >
        {unfollowMutation.isPending ? '...' : '팔로잉'}
      </button>
    );
  }

  if (followStatus === 'pending') {
    return (
      <button
        disabled
        className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/20 text-white/60"
      >
        요청 중
      </button>
    );
  }

  // layer 0 = no way to request yet; layer 1+ = can request
  if (currentLayer >= 1) {
    return (
      <button
        onClick={() => requestMutation.mutate()}
        disabled={requestMutation.isPending}
        className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white text-primary-600 hover:bg-white/90 transition-colors"
      >
        {requestMutation.isPending ? '...' : '팔로우'}
      </button>
    );
  }

  return null;
}

// ─── Layer Gate ───────────────────────────────────────────────────────
function LayerGate({ layer, minLayer, children }: {
  layer: number;
  minLayer: number;
  children: React.ReactNode;
}) {
  if (layer >= minLayer) return <>{children}</>;
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-4xl mb-3">🔒</p>
      <p className="text-base font-semibold text-gray-700">비공개 탭이에요</p>
      <p className="text-sm text-gray-400 mt-1">팔로우가 수락되면 볼 수 있어요</p>
    </div>
  );
}

// ─── Tab 01: 인증 게시물 ───────────────────────────────────────────────
function VerificationCard({ item }: { item: VerificationFeedItem }) {
  return (
    <div className="rounded-2xl overflow-hidden glass-card">
      {/* 4:5 비율 이미지 */}
      {item.imageUrl && (
        <div className="aspect-[4/5] overflow-hidden">
          <img
            src={item.imageUrl}
            alt="인증 이미지"
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{VERIFICATION_TYPE_ICON[item.verificationType] ?? '📋'}</span>
            <div>
              <p className="text-xs font-semibold text-gray-700 line-clamp-1">
                {item.challengeTitle ?? '챌린지'}
              </p>
              {item.day != null && (
                <p className="text-[11px] text-gray-400">Day {item.day}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {item.score > 0 && (
              <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-100">
                +{item.score}점
              </span>
            )}
          </div>
        </div>
        {item.todayNote && (
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mt-1">{item.todayNote}</p>
        )}
        <p className="text-[11px] text-gray-400 mt-2">{formatDate(item.createdAt)}</p>
      </div>
    </div>
  );
}

function VerificationsTab({ userId }: { userId: string }) {
  const observerRef = useRef<IntersectionObserver | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['personal-feed-verifications', userId],
    queryFn: ({ pageParam }) =>
      personalFeedApi.getVerifications(userId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextToken ?? undefined,
  });

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      });
      observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  if (isLoading) return <Loading />;

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-4xl mb-3">📸</p>
        <p className="text-base font-semibold text-gray-700">아직 인증 게시물이 없어요</p>
        <p className="text-sm text-gray-400 mt-1">퀘스트를 완료하면 여기에 자동으로 쌓여요</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-20">
      {allItems.map((item) => (
        <VerificationCard key={item.verificationId} item={item} />
      ))}
      <div ref={sentinelRef} className="h-4" />
      {isFetchingNextPage && (
        <div className="py-4 text-center text-sm text-gray-400">불러오는 중...</div>
      )}
    </div>
  );
}

// ─── Tab 02: 챌린지 목록 ──────────────────────────────────────────────
function ChallengeHistoryCard({ item }: { item: ChallengeFeedItem }) {
  const meta = BUCKET_STATE_META[item.bucketState] ?? BUCKET_STATE_META.active;
  const progressPct = item.durationDays > 0
    ? Math.round((item.completedDays / item.durationDays) * 100)
    : 0;

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {item.badgeIcon && <span className="text-2xl flex-shrink-0">{item.badgeIcon}</span>}
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 text-sm line-clamp-1">{item.title}</p>
            {item.category && (
              <p className="text-xs text-gray-400 mt-0.5">{item.category}</p>
            )}
          </div>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${meta.color}`}>
          {meta.label}
        </span>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-[11px] text-gray-400 mb-1">
          <span>{item.completedDays}/{item.durationDays}일 완료</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        {item.score > 0 && (
          <span className="text-xs font-bold text-primary-600">
            누적 {item.score.toLocaleString()}점
          </span>
        )}
        {item.startDate && (
          <span className="text-[11px] text-gray-400 ml-auto">{formatDate(item.startDate)} 시작</span>
        )}
      </div>
    </div>
  );
}

function ChallengesTab({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['personal-feed-challenges', userId],
    queryFn: () => personalFeedApi.getChallengeHistory(userId),
  });

  if (isLoading) return <Loading />;

  const challenges = data?.challenges ?? [];

  if (challenges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-4xl mb-3">🎯</p>
        <p className="text-base font-semibold text-gray-700">참여한 챌린지가 없어요</p>
        <p className="text-sm text-gray-400 mt-1">챌린지에 참여하면 여기에 기록이 쌓여요</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-20">
      {challenges.map((item) => (
        <ChallengeHistoryCard key={item.userChallengeId} item={item} />
      ))}
    </div>
  );
}

// ─── Tab 03: 업적 ─────────────────────────────────────────────────────
function AchievementsTab({ achievements }: { achievements: FeedAchievements }) {
  return (
    <div className="space-y-4 pb-20">
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">활동 통계</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-primary-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary-700">
              {achievements.verifications.totalScore.toLocaleString()}
            </p>
            <p className="text-xs text-primary-500 mt-0.5">누적 스코어</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-700">
              {achievements.verifications.total}
            </p>
            <p className="text-xs text-green-500 mt-0.5">총 인증 횟수</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">
              {achievements.challenges.completed}
            </p>
            <p className="text-xs text-blue-500 mt-0.5">챌린지 완주</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-700">
              {achievements.challenges.total}
            </p>
            <p className="text-xs text-orange-500 mt-0.5">총 참여 챌린지</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">응원</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 bg-pink-50 rounded-xl p-3">
            <span className="text-2xl">💌</span>
            <div>
              <p className="text-lg font-bold text-pink-700">{achievements.cheers.receivedCount}</p>
              <p className="text-xs text-pink-400">받은 응원</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-purple-50 rounded-xl p-3">
            <span className="text-2xl">📣</span>
            <div>
              <p className="text-lg font-bold text-purple-700">{achievements.cheers.sentCount}</p>
              <p className="text-xs text-purple-400">보낸 응원</p>
            </div>
          </div>
        </div>
      </div>

      {achievements.badges.length > 0 ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">
            획득 뱃지 ({achievements.badges.length})
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {achievements.badges.map((badge) => {
              const meta = BADGE_META[badge.badgeId] ?? { icon: '🏅', name: badge.badgeId, desc: '' };
              return (
                <div key={badge.badgeId + badge.grantedAt} className="flex flex-col items-center gap-1 bg-gray-50 rounded-xl p-3">
                  <span className="text-3xl">{meta.icon}</span>
                  <p className="text-xs font-semibold text-gray-700 text-center">{meta.name}</p>
                  <p className="text-[10px] text-gray-400 text-center">{meta.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
          <p className="text-4xl mb-2">🏅</p>
          <p className="text-sm font-semibold text-gray-700">아직 획득한 뱃지가 없어요</p>
          <p className="text-xs text-gray-400 mt-1">퀘스트를 완료하면 뱃지를 획득할 수 있어요</p>
        </div>
      )}

      {achievements.leaderHistory.total > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">👑</span>
            <h3 className="text-sm font-semibold text-gray-700">리더 이력</h3>
          </div>

          {achievements.leaderBadges.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {achievements.leaderBadges.map((badge) => {
                const meta = LEADER_BADGE_META[badge.badgeId] ?? { icon: '🎖️', name: badge.badgeId, desc: '' };
                return (
                  <div key={badge.badgeId} className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1">
                    <span className="text-sm">{meta.icon}</span>
                    <span className="text-xs font-semibold text-yellow-700">{meta.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-amber-700">{achievements.leaderHistory.total}</p>
              <p className="text-[11px] text-amber-500">총 개설</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-green-700">{achievements.leaderHistory.completed}</p>
              <p className="text-[11px] text-green-500">완료 운영</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-700">{achievements.leaderHistory.totalParticipants}</p>
              <p className="text-[11px] text-blue-500">누적 참여자</p>
            </div>
          </div>

          {achievements.leaderHistory.recentChallenges.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400 mb-2">최근 운영 챌린지</p>
              {achievements.leaderHistory.recentChallenges.map((c) => (
                <div key={c.challengeId} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <p className="text-sm font-medium text-gray-700 line-clamp-1 flex-1 min-w-0 pr-2">
                    {c.title}
                  </p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">{c.participantCount}명</span>
                    <span className="text-[11px] text-green-600 font-semibold">완료</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 04: 자유 게시물 ──────────────────────────────────────────────
const VISIBILITY_META = {
  private: { label: '나만 보기', icon: '🔒' },
  followers: { label: '팔로워', icon: '👥' },
  mutual: { label: '맞팔만', icon: '💚' },
};

function PersonalPostEditor({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'followers' | 'mutual'>('followers');
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => personalFeedApi.createPost({ content, imageKeys, visibility }),
    onSuccess: () => {
      setContent('');
      setImageKeys([]);
      queryClient.invalidateQueries({ queryKey: ['personal-feed-posts', 'me'] });
      onCreated();
    },
  });

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { uploadUrl, key } = await personalFeedApi.getPostUploadUrl(file.type);
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setImageKeys((prev) => [...prev, key]);
    } catch {
      // ignore upload errors
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-4 mb-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="자유롭게 기록해보세요..."
        rows={3}
        className="w-full text-sm text-gray-700 placeholder-gray-400 resize-none outline-none"
      />
      {imageKeys.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {imageKeys.map((key, i) => (
            <div key={key} className="relative">
              <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">
                {i + 1}
              </div>
              <button
                onClick={() => setImageKeys((prev) => prev.filter((k) => k !== key))}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          {/* 이미지 첨부 */}
          <label className="cursor-pointer text-gray-400 hover:text-gray-600 text-sm">
            📎
            <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} disabled={uploading || imageKeys.length >= 5} />
          </label>
          {uploading && <span className="text-xs text-gray-400">업로드 중...</span>}
          {/* visibility 선택 */}
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'private' | 'followers' | 'mutual')}
            className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1 bg-white"
          >
            {(Object.keys(VISIBILITY_META) as Array<keyof typeof VISIBILITY_META>).map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_META[v].icon} {VISIBILITY_META[v].label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => createMutation.mutate()}
          disabled={(!content.trim() && imageKeys.length === 0) || createMutation.isPending}
          className="px-4 py-1.5 text-xs font-semibold rounded-full bg-primary-500 text-white disabled:opacity-40 hover:bg-primary-600 transition-colors"
        >
          {createMutation.isPending ? '게시 중...' : '게시'}
        </button>
      </div>
    </div>
  );
}

function PersonalPostCard({ post, isOwn }: { post: PersonalPost; isOwn: boolean }) {
  const queryClient = useQueryClient();
  const visibilityMeta = VISIBILITY_META[post.visibility] ?? VISIBILITY_META.followers;
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content ?? '');

  const deleteMutation = useMutation({
    mutationFn: () => personalFeedApi.deletePost(post.postId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['personal-feed-posts'] }),
  });

  const editMutation = useMutation({
    mutationFn: () => personalFeedApi.updatePost(post.postId, { content: editContent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-posts'] });
      setEditing(false);
    },
  });

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-400">
          {visibilityMeta.icon} {visibilityMeta.label} · {formatDate(post.createdAt)}
        </span>
        {isOwn && !editing && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditing(true); setEditContent(post.content ?? ''); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              수정
            </button>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-xs text-red-400 hover:text-red-600"
            >
              삭제
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
            className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-primary-400"
          />
          <div className="flex gap-2">
            <button
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending || !editContent.trim()}
              className="px-4 py-1.5 text-xs font-semibold rounded-full bg-primary-500 text-white disabled:opacity-40 hover:bg-primary-600 transition-colors"
            >
              {editMutation.isPending ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-1.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        post.content && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
        )
      )}
      {post.imageUrls.length > 0 && (
        post.imageUrls.filter(Boolean).length === 1 ? (
          /* 단일 이미지 — 4:5 비율, 엣지-투-엣지 (패딩 바깥으로 빠져나가기) */
          <div className="-mx-4 mt-3 aspect-[4/5] overflow-hidden">
            <img
              src={post.imageUrls[0]!}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          /* 복수 이미지 — 2열 그리드 */
          <div className="grid grid-cols-2 gap-1 mt-3 rounded-xl overflow-hidden">
            {post.imageUrls.filter(Boolean).map((url, i) => (
              <img
                key={i}
                src={url!}
                alt=""
                loading="lazy"
                className="w-full aspect-[4/5] object-cover"
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function SavedPostCard({ item }: { item: SavedPostItem }) {
  const queryClient = useQueryClient();

  const unsaveMutation = useMutation({
    mutationFn: () => personalFeedApi.unsavePlazaPost(item.plazaPostId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['personal-feed-saved-posts'] }),
  });

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 line-clamp-2">
            {item.postSnapshot?.content || '(내용 없음)'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1.5">
            {formatDate(item.savedAt)} 저장 · 광장 게시물
          </p>
        </div>
        <button
          onClick={() => unsaveMutation.mutate()}
          disabled={unsaveMutation.isPending}
          className="text-yellow-500 hover:text-gray-400 text-lg flex-shrink-0"
          title="저장 취소"
        >
          🔖
        </button>
      </div>
    </div>
  );
}

function PostsTab({ userId, isOwn }: { userId: string; isOwn: boolean }) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: postsLoading,
  } = useInfiniteQuery({
    queryKey: ['personal-feed-posts', userId],
    queryFn: ({ pageParam }) =>
      personalFeedApi.getPosts(userId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextToken ?? undefined,
  });

  const {
    data: savedData,
    isLoading: savedLoading,
  } = useQuery({
    queryKey: ['personal-feed-saved-posts'],
    queryFn: () => personalFeedApi.getSavedPosts(),
    enabled: isOwn || userId === 'me',
    refetchOnMount: 'always',
  });

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      });
      observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  const allPosts = postsData?.pages.flatMap((p) => p.posts) ?? [];
  const savedPosts = savedData?.savedPosts ?? [];

  return (
    <div className="space-y-3 pb-20">
      {/* 본인 피드: 게시 버튼 */}
      {isOwn && (
        <button
          onClick={() => setShowEditor((v) => !v)}
          className="w-full glass-panel rounded-2xl px-4 py-3 text-sm text-gray-400 text-left hover:bg-white/60 transition-colors"
        >
          ✏️ 자유롭게 기록해보세요...
        </button>
      )}

      {showEditor && isOwn && (
        <PersonalPostEditor onCreated={() => setShowEditor(false)} />
      )}

      {/* 자유 게시물 목록 */}
      {postsLoading ? (
        <Loading />
      ) : allPosts.length === 0 && !isOwn ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-3xl mb-2">📝</p>
          <p className="text-sm font-semibold text-gray-700">아직 게시물이 없어요</p>
        </div>
      ) : (
        <>
          {allPosts.map((post) => (
            <PersonalPostCard key={post.postId} post={post} isOwn={isOwn} />
          ))}
          <div ref={sentinelRef} className="h-4" />
          {isFetchingNextPage && (
            <div className="py-4 text-center text-sm text-gray-400">불러오는 중...</div>
          )}
        </>
      )}

      {/* 저장된 광장 게시물 (본인만) */}
      {isOwn && (
        <>
          <div className="pt-4 pb-2">
            <h3 className="text-sm font-semibold text-gray-500">저장한 광장 게시물</h3>
          </div>
          {savedLoading ? (
            <Loading />
          ) : savedPosts.length === 0 ? (
            <div className="glass-card rounded-2xl p-4 text-center">
              <p className="text-sm text-gray-400">광장 게시물에서 북마크를 눌러 저장해보세요 🔖</p>
            </div>
          ) : (
            savedPosts.map((item) => (
              <SavedPostCard key={item.saveId} item={item} />
            ))
          )}
        </>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────
export function PersonalFeedPage() {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<FeedTab>('verifications');
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  const resolvedUserId = userIdParam ?? 'me';
  const fromInvite = (location.state as { fromInvite?: boolean } | null)?.fromInvite === true;

  const blockMutation = useMutation({
    mutationFn: () => personalFeedApi.blockUser(resolvedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-profile', resolvedUserId] });
      navigate(-1);
    },
  });

  const { data: profile } = useQuery({
    queryKey: ['personal-feed-profile', resolvedUserId],
    queryFn: () => personalFeedApi.getProfile(resolvedUserId),
  });

  const { data: achievements, isLoading: achievementsLoading } = useQuery({
    queryKey: ['personal-feed-achievements', resolvedUserId],
    queryFn: () => personalFeedApi.getAchievements(resolvedUserId),
  });

  const topLeaderBadge = achievements?.leaderBadges?.[0];

  const isOwn = profile?.isOwn ?? (userIdParam === 'me');
  const serverLayer = profile?.currentLayer ?? 0;
  // 초대 링크로 접속한 경우 팔로우 버튼을 노출하기 위해 layer를 최소 2로 상향
  const currentLayer = fromInvite && serverLayer >= 0 ? Math.max(serverLayer, 2) : serverLayer;
  const displayName = profile?.displayName ?? (isOwn ? (user?.name ?? '나') : '...');
  const displayIcon = profile?.animalIcon ?? (isOwn ? (user?.animalIcon ?? '🐰') : '🐰');

  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 pt-12 pb-6 px-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-white/80 hover:text-white text-xl"
            >
              ←
            </button>
            <span className="text-white/80 text-sm">프로필</span>
          </div>
          {isOwn && (
            <button
              onClick={() => navigate('/personal-feed/settings')}
              className="text-white/70 hover:text-white text-sm px-3 py-1 rounded-full border border-white/20 hover:border-white/40 transition-colors"
            >
              설정
            </button>
          )}
          {!isOwn && profile && currentLayer !== -1 && (
            <button
              onClick={() => setShowBlockConfirm(true)}
              className="text-white/60 hover:text-white/90 text-sm px-2 py-1 rounded-full border border-white/10 hover:border-white/30 transition-colors"
              title="더보기"
            >
              ···
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl flex-shrink-0">
            {displayIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-white font-bold text-xl truncate">{displayName}</h1>
              {topLeaderBadge && (
                <span className="text-lg flex-shrink-0" title={LEADER_BADGE_META[topLeaderBadge.badgeId]?.name}>
                  {LEADER_BADGE_META[topLeaderBadge.badgeId]?.icon ?? '👑'}
                </span>
              )}
            </div>
            {isOwn && profile && (
              <p className="text-white/60 text-xs mt-0.5">
                {profile.feedHandle ? `@${profile.feedHandle} · ` : ''}
                {profile.feedSettings.isPublic ? '🌍 공개 중' : '🔒 비공개'}
              </p>
            )}
            {!isOwn && profile && (
              <p className="text-white/60 text-xs mt-0.5">
                {profile.isMutual ? '💚 서로 팔로우' : profile.followStatus === 'accepted' ? '✅ 팔로잉' : ''}
              </p>
            )}
          </div>
          {!isOwn && profile && (
            <FollowButton profile={profile} targetUserId={resolvedUserId} effectiveLayer={currentLayer} />
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="glass-header sticky top-0 z-10">
        <div className="flex">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-xs font-semibold transition-colors relative ${
                activeTab === tab.key ? 'text-primary-600' : 'text-gray-400'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 차단 확인 다이얼로그 */}
      {showBlockConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowBlockConfirm(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900 text-center">이 사용자를 차단할까요?</p>
            <p className="text-sm text-gray-500 text-center">차단하면 서로의 피드를 볼 수 없어요. 설정에서 해제할 수 있어요.</p>
            <button
              onClick={() => blockMutation.mutate()}
              disabled={blockMutation.isPending}
              className="w-full py-3 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {blockMutation.isPending ? '처리 중...' : '차단하기'}
            </button>
            <button
              onClick={() => setShowBlockConfirm(false)}
              className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 컨텐츠 */}
      <div className="p-4">
        {activeTab === 'verifications' && (
          <LayerGate layer={currentLayer} minLayer={isOwn ? 0 : 3}>
            <VerificationsTab userId={resolvedUserId} />
          </LayerGate>
        )}
        {activeTab === 'challenges' && (
          <LayerGate layer={currentLayer} minLayer={isOwn ? 0 : 4}>
            <ChallengesTab userId={resolvedUserId} />
          </LayerGate>
        )}
        {activeTab === 'achievements' && (
          <LayerGate layer={currentLayer} minLayer={isOwn ? 0 : 1}>
            {achievementsLoading || !achievements ? (
              <Loading />
            ) : (
              <AchievementsTab achievements={achievements} />
            )}
          </LayerGate>
        )}
        {activeTab === 'posts' && (
          <LayerGate layer={currentLayer} minLayer={isOwn ? 0 : 3}>
            <PostsTab userId={resolvedUserId} isOwn={isOwn} />
          </LayerGate>
        )}
      </div>
    </div>
  );
}
