import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { ChallengeControlCard } from './ChallengeControlCard';
import { VerificationComments } from './VerificationComments';

/**
 * 리더 운영 탭 v1 (PRODUCT_SPEC §4.12-A)
 * — 챌린지 생성자(리더)에게만 노출. 오늘 브리핑 + 참가자 진행률 리스트.
 */

interface LeaderBriefing {
  challengeId: string;
  day: number;
  date: string;
  verifiedCount: number;
  totalActive: number;
  verificationRate: number;
  incompleteUsers: Array<{
    userId: string;
    userChallengeId: string;
    personalGoal: string | null;
    consecutiveDays: number;
    status: string | null;
  }>;
  incompleteCount: number;
  pendingQuestSubmissions: number;
}

interface LeaderParticipant {
  userChallengeId: string;
  userId: string;
  status: string;
  currentDay: number;
  durationDays: number;
  completedDays: number;
  progressPercentage: number;
  consecutiveDays: number;
  personalGoal: string | null;
  usedRemedyCount: number;
  joinedAt: string | null;
}

interface LeaderParticipantsData {
  participants: LeaderParticipant[];
  total: number;
  summary: {
    active: number;
    pending: number;
    completed: number;
    failed: number;
    gaveUp: number;
  };
}

const PARTICIPANT_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  active: { label: '진행중', badgeClass: 'bg-blue-100 text-blue-700' },
  pending: { label: '승인 대기', badgeClass: 'bg-amber-100 text-amber-700' },
  completed: { label: '완주', badgeClass: 'bg-green-100 text-green-700' },
  failed: { label: '실패', badgeClass: 'bg-red-100 text-red-600' },
  gave_up: { label: '포기', badgeClass: 'bg-gray-100 text-gray-500' },
};

const maskUserId = (userId: string) =>
  userId.length > 8 ? `${userId.slice(0, 8)}…` : userId;

function BriefingSection({ challengeId }: { challengeId: string }) {
  const { data: briefing, isLoading, isError } = useQuery<LeaderBriefing>({
    queryKey: ['leader-briefing', challengeId],
    queryFn: async () => {
      const res = await apiClient.get(`/c/${challengeId}/leader/briefing`);
      return res.data.data;
    },
    refetchInterval: 60 * 1000,
  });

  if (isLoading) return <section className="glass-card rounded-2xl p-5"><Loading /></section>;
  if (isError || !briefing) {
    return (
      <section className="glass-card rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 mb-2">📋 오늘 브리핑</h3>
        <p className="text-sm text-gray-500">브리핑을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      </section>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900">📋 오늘 브리핑</h3>
        <span className="text-xs text-gray-400">Day {briefing.day} · {briefing.date}</span>
      </div>

      {/* 인증률 카드 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">오늘 인증률</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {briefing.verifiedCount}/{briefing.totalActive}
          </p>
          <p className="text-[11px] text-primary-600 font-semibold">{briefing.verificationRate}%</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">미인증</p>
          <p className="mt-1 text-lg font-bold text-amber-600">{briefing.incompleteCount}명</p>
          <p className="text-[11px] text-gray-400">오늘 기준</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">심사 대기</p>
          <p className="mt-1 text-lg font-bold text-indigo-600">{briefing.pendingQuestSubmissions}건</p>
          <p className="text-[11px] text-gray-400">퀘스트 제출물</p>
        </div>
      </div>

      {/* 인증률 프로그레스 */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all"
          style={{ width: `${briefing.verificationRate}%` }}
        />
      </div>

      {/* 미인증자 목록 */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">오늘 미인증 참가자</p>
        {briefing.incompleteUsers.length === 0 ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
            <p className="text-sm text-emerald-700 font-medium">🎉 모든 참가자가 오늘 인증을 완료했어요!</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {briefing.incompleteUsers.map((u) => (
              <div
                key={u.userChallengeId}
                className="flex items-center gap-2.5 rounded-xl bg-white/60 border border-gray-100 px-3 py-2"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center text-[11px] font-bold text-amber-700 flex-shrink-0">
                  {u.userId?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{maskUserId(u.userId)}</p>
                  {u.personalGoal && (
                    <p className="text-[11px] text-gray-400 truncate">🎯 {u.personalGoal}</p>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 flex-shrink-0">연속 {u.consecutiveDays}일</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ParticipantsSection({ challengeId }: { challengeId: string }) {
  const { data, isLoading, isError } = useQuery<LeaderParticipantsData>({
    queryKey: ['leader-participants', challengeId],
    queryFn: async () => {
      const res = await apiClient.get(`/c/${challengeId}/leader/participants`);
      return res.data.data;
    },
  });

  if (isLoading) return <section className="glass-card rounded-2xl p-5"><Loading /></section>;
  if (isError || !data) {
    return (
      <section className="glass-card rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 mb-2">👥 참가자</h3>
        <p className="text-sm text-gray-500">참가자 목록을 불러오지 못했어요.</p>
      </section>
    );
  }

  const { participants, total, summary } = data;

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900">👥 참가자</h3>
        <span className="text-xs text-gray-400">총 {total}명</span>
      </div>

      {/* 상태 요약 */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">진행중 {summary.active}</span>
        {summary.pending > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">승인 대기 {summary.pending}</span>
        )}
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700">완주 {summary.completed}</span>
        {summary.gaveUp > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">포기 {summary.gaveUp}</span>
        )}
      </div>

      {participants.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">아직 참가자가 없어요.</p>
      ) : (
        <div className="space-y-2">
          {participants.map((p) => {
            const statusMeta = PARTICIPANT_STATUS_META[p.status] ?? {
              label: p.status,
              badgeClass: 'bg-gray-100 text-gray-500',
            };
            return (
              <div key={p.userChallengeId} className="rounded-xl bg-white/60 border border-gray-100 p-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
                    {p.userId?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-800 truncate">{maskUserId(p.userId)}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    {p.personalGoal && (
                      <p className="text-[11px] text-gray-400 truncate">🎯 {p.personalGoal}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{p.progressPercentage}%</p>
                    <p className="text-[11px] text-gray-400">
                      {p.completedDays}/{p.durationDays}일
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all"
                    style={{ width: `${p.progressPercentage}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-400">
                  <span>Day {p.currentDay}</span>
                  <span>연속 {p.consecutiveDays}일</span>
                  {p.usedRemedyCount > 0 && <span>보완 {p.usedRemedyCount}회</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface OpsVerification {
  verificationId: string;
  displayName: string;
  day: number;
  verificationType: string;
  todayNote: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  createdAt: string;
}

const VERIFICATION_TYPE_META: Record<string, string> = {
  image: '📸 사진',
  video: '🎬 영상',
  link: '🔗 링크',
  text: '📝 텍스트',
};

// 리더가 게시물을 조회하고 '챌린지 리더' 신원으로 댓글을 다는 운영 전용 섹션.
// (피드 탭 댓글은 익명 고정 — 리더 신원 댓글은 여기서만 가능)
function OpsPostsSection({ challengeId }: { challengeId: string }) {
  const { data: posts = [], isLoading, isError } = useQuery<OpsVerification[]>({
    queryKey: ['challenge-feed-verifications', challengeId],
    queryFn: async () => {
      const res = await apiClient.get(
        `/c/verifications?isPublic=true&limit=50&challengeId=${challengeId}`,
      );
      return res.data?.data?.verifications ?? [];
    },
    staleTime: 15_000,
  });

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-gray-900">📰 게시물 · 리더 댓글</h3>
        {posts.length > 0 && <span className="text-xs text-gray-400">{posts.length}건</span>}
      </div>
      <p className="text-[11px] text-gray-400 mb-4">여기서 다는 댓글은 👑 챌린지 리더로 표시됩니다.</p>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <p className="text-sm text-gray-500">게시물을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">아직 인증 게시물이 없어요.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const thumb = post.imageUrl ? resolveMediaUrl(post.imageUrl) : null;
            return (
              <div key={post.verificationId} className="rounded-xl bg-white/60 border border-gray-100 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-md border border-primary-100">
                    Day {post.day || '-'}
                  </span>
                  <span className="text-[11px] font-medium text-gray-600 truncate">{post.displayName || '익명'}</span>
                  <span className="text-[11px] text-gray-400 ml-auto flex-shrink-0">
                    {new Date(post.createdAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </span>
                </div>

                <div className="flex gap-2.5">
                  {thumb && (
                    <img src={thumb} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-400">{VERIFICATION_TYPE_META[post.verificationType] ?? '📝 텍스트'}</p>
                    {post.todayNote ? (
                      <p className="text-sm text-gray-700 leading-relaxed line-clamp-3 mt-0.5">{post.todayNote}</p>
                    ) : (
                      <p className="text-sm text-gray-400 mt-0.5">내용 없음</p>
                    )}
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-gray-100">
                  <VerificationComments
                    verificationId={post.verificationId}
                    challengeId={challengeId}
                    canComment
                    challengeEnded={false}
                    authorMode="leader"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function LeaderOpsTab({ challengeId }: { challengeId: string }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <ChallengeControlCard challengeId={challengeId} />
      <BriefingSection challengeId={challengeId} />
      <ParticipantsSection challengeId={challengeId} />
      <OpsPostsSection challengeId={challengeId} />

      {/* 퀘스트 심사 바로가기 */}
      <button
        type="button"
        onClick={() => navigate(`/quests?challengeId=${challengeId}`)}
        className="w-full py-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold text-sm hover:bg-indigo-100 transition-colors"
      >
        퀘스트 보드 열기 →
      </button>
    </div>
  );
}
