import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { challengeApi, type QuestProposal } from '@/features/challenge/api/challengeApi';
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
  days?: Array<{ day: number; status: string; granted: boolean }>;
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

// 참여자 일자별 완료 인정 그리드 — 칸을 누르면 그날 인증 게시물을 보여주고 리더가 확인 후 처리
function ParticipantDayGrid({
  challengeId,
  participant,
  pendingRequests = [],
}: {
  challengeId: string;
  participant: LeaderParticipant;
  /** 이 참여자의 대기 중 인정 요청 — 해당 날짜 칸에 🙋 마커 + 패널에 요청 내용 표시 */
  pendingRequests?: Array<{ requestId: string; day: number; message?: string | null; verificationId?: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const days = participant.days ?? [];
  const requestDays = new Set(pendingRequests.map((r) => Number(r.day)));

  // 선택한 날짜의 인증 게시물 조회
  const { data: dayVerifications = [], isLoading: vfLoading } = useQuery<any[]>({
    queryKey: ['leader-day-verifications', challengeId, participant.userId, selectedDay],
    enabled: open && selectedDay !== null,
    queryFn: () =>
      challengeApi.getParticipantDayVerifications(challengeId, participant.userId, selectedDay as number),
  });

  const setStateMutation = useMutation({
    mutationFn: ({ day, state }: { day: number; state: 'complete' | 'partial' | 'none' }) =>
      challengeApi.setDayState(challengeId, participant.userId, day, state),
    onSuccess: (_d, vars) => {
      toast.success(
        vars.state === 'complete' ? '완료 인정했어요 (+1점)' : vars.state === 'partial' ? '일부로 처리했어요' : '미완(취소) 처리했어요',
      );
      setSelectedDay(null);
      queryClient.invalidateQueries({ queryKey: ['leader-participants', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['leader-briefing', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '처리에 실패했어요'),
  });

  // 인증 게시물 반려 — 피드에서 운영탭으로 일원화된 액션
  const rejectVfMutation = useMutation({
    mutationFn: ({ verificationId, reason }: { verificationId: string; reason?: string }) =>
      challengeApi.rejectVerification(challengeId, verificationId, { reason }),
    onSuccess: () => {
      toast.success('인증을 반려했어요. 피드에서 숨겨지고 본인 기록에는 남아요.');
      queryClient.invalidateQueries({ queryKey: ['leader-day-verifications', challengeId, participant.userId] });
      queryClient.invalidateQueries({ queryKey: ['leader-participants', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-feed-verifications', challengeId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '반려에 실패했어요'),
  });

  if (days.length === 0) return null;

  const selected = selectedDay !== null ? days.find((d) => d.day === selectedDay) : null;
  const curLabel = selected
    ? selected.status === 'success' ? '완료' : selected.status === 'partial' ? '일부' : '미완'
    : '';

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setSelectedDay(null); }}
        className="text-[11px] font-semibold text-gray-500 flex items-center gap-1"
      >
        일자별 완료 인정 {open ? '▲' : '▼'}
      </button>
      {open && (
        <>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const isSuccess = d.status === 'success';
              const base =
                isSuccess
                  ? 'bg-emerald-500 text-white'
                  : d.status === 'partial'
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-gray-100 text-gray-400';
              const isSel = selectedDay === d.day;
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => setSelectedDay(isSel ? null : d.day)}
                  className={`relative h-8 rounded-md text-[11px] font-semibold transition-colors ${base} ${isSel ? 'ring-2 ring-gray-800' : ''}`}
                >
                  {d.day}
                  {d.granted && (
                    <span className="absolute -top-1 -right-1 text-[8px] leading-none bg-white text-emerald-700 rounded-full w-3 h-3 flex items-center justify-center border border-emerald-300">
                      ✋
                    </span>
                  )}
                  {requestDays.has(d.day) && (
                    <span className="absolute -top-1 -left-1 text-[8px] leading-none bg-white text-indigo-700 rounded-full w-3 h-3 flex items-center justify-center border border-indigo-300">
                      🙋
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 align-middle" /> 완료 ·
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-200 align-middle ml-1" /> 일부 ·
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-100 align-middle ml-1" /> 미완 · ✋ 수동인정 · 🙋 인정요청. 칸을 눌러 기록 확인 후 처리.
          </p>

          {/* 선택한 날짜 리뷰 패널 — 인증 게시물 확인 후 처리 */}
          {selected && (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-800">
                {selected.day}일차 · 현재 {curLabel}
              </p>

              {/* 이 날짜에 들어온 인정 요청 — 요청 내용과 함께 확인 */}
              {pendingRequests
                .filter((r) => Number(r.day) === selected.day)
                .map((r) => (
                  <div key={r.requestId} className="mt-2 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-2">
                    <p className="text-[11px] font-bold text-indigo-800">🙋 이 날짜로 인증 인정 요청이 와 있어요</p>
                    {r.message && <p className="text-[11px] text-indigo-700 mt-0.5 whitespace-pre-wrap">"{r.message}"</p>}
                    <p className="text-[10px] text-indigo-500 mt-0.5">아래 기록 확인 후 '완료 인정'으로 승인하거나, 인정 요청 섹션에서 반려하세요.</p>
                  </div>
                ))}

              {vfLoading ? (
                <p className="text-[11px] text-gray-400 mt-2">불러오는 중...</p>
              ) : dayVerifications.length === 0 ? (
                <p className="text-[11px] text-gray-500 mt-2">이 날 등록된 인증 기록이 없습니다.</p>
              ) : (
                <>
                  <p className="text-[11px] text-amber-700 mt-2">
                    인증 기록 {dayVerifications.length}건이 있습니다. 확인 후 처리하세요.
                  </p>
                  <div className="mt-2 space-y-2">
                    {dayVerifications.map((v) => (
                      <div key={v.verificationId} className="flex gap-2 rounded-lg bg-white border border-gray-100 p-2">
                        {v.imageUrl ? (
                          <img
                            src={resolveMediaUrl(v.imageUrl)}
                            alt=""
                            className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center text-base flex-shrink-0">📝</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {v.questTitle && <span className="text-[11px] font-semibold text-gray-700 truncate">{v.questTitle}</span>}
                            {v.rejectedByLeader && <span className="text-[9px] px-1 rounded bg-rose-100 text-rose-600">반려됨</span>}
                            {v.hiddenByAdmin && <span className="text-[9px] px-1 rounded bg-gray-200 text-gray-600">숨김</span>}
                            {!v.isPublic && !v.rejectedByLeader && <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500">비공개</span>}
                          </div>
                          {v.todayNote && <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2 whitespace-pre-wrap">{v.todayNote}</p>}
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            인증시간 {(v.performedAt || v.createdAt) ? new Date(v.performedAt || v.createdAt).toLocaleString('ko-KR') : '-'}
                          </p>
                          {!v.rejectedByLeader && (
                            <button
                              type="button"
                              disabled={rejectVfMutation.isPending}
                              onClick={() => {
                                const reason = window.prompt('이 인증을 반려할까요? 반려 사유(선택)\n피드·마당에서 숨겨지고 그날 완료·점수가 해제돼요.');
                                if (reason === null) return;
                                rejectVfMutation.mutate({ verificationId: v.verificationId, reason: reason.trim() || undefined });
                              }}
                              className="mt-1 text-[10px] font-semibold text-rose-500 hover:text-rose-700 disabled:opacity-50"
                            >
                              🚩 이 인증 반려
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-3 flex gap-1.5">
                <button
                  type="button"
                  disabled={setStateMutation.isPending}
                  onClick={() => setStateMutation.mutate({ day: selected.day, state: 'complete' })}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500 text-white disabled:opacity-50"
                >
                  ✅ 완료 인정 (+1점)
                </button>
                <button
                  type="button"
                  disabled={setStateMutation.isPending}
                  onClick={() => setStateMutation.mutate({ day: selected.day, state: 'partial' })}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-200 text-amber-800 disabled:opacity-50"
                >
                  🟡 일부
                </button>
                <button
                  type="button"
                  disabled={setStateMutation.isPending}
                  onClick={() => setStateMutation.mutate({ day: selected.day, state: 'none' })}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-gray-200 text-gray-700 disabled:opacity-50"
                >
                  ⬜ 미완(취소)
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// 참가자 전체 게시물 요약 — 일자별 썸네일·내용 일부·인증시간 (펼침 시 로드)
function ParticipantPostsSummary({ challengeId, participantId }: { challengeId: string; participantId: string }) {
  const { data: posts = [], isLoading } = useQuery<any[]>({
    queryKey: ['leader-participant-posts', challengeId, participantId],
    queryFn: async () => {
      const res = await apiClient.get(`/c/${challengeId}/leader/participants/${participantId}/verifications`);
      return res.data.data?.verifications ?? [];
    },
  });

  if (isLoading) return <p className="text-[11px] text-gray-400 mt-2">게시물을 불러오는 중...</p>;
  if (posts.length === 0) return <p className="text-[11px] text-gray-400 mt-2">올린 인증 게시물이 없어요.</p>;

  return (
    <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
      {posts.map((v) => (
        <div key={v.verificationId} className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 p-2">
          <span className="text-[10px] font-bold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded flex-shrink-0">
            D{v.day ?? '-'}
          </span>
          {v.imageUrl ? (
            <img
              src={resolveMediaUrl(v.imageUrl)}
              alt=""
              className="w-9 h-9 rounded-md object-cover flex-shrink-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">📝</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-700 truncate">
              {v.todayNote || v.questTitle || '(내용 없음)'}
              {v.rejectedByLeader && <span className="ml-1 text-[9px] px-1 rounded bg-rose-100 text-rose-600">반려</span>}
              {v.scoreCancelled && <span className="ml-1 text-[9px] px-1 rounded bg-gray-200 text-gray-500">취소</span>}
              {v.isExtra && <span className="ml-1 text-[9px] px-1 rounded bg-gray-100 text-gray-500">추가</span>}
            </p>
            <p className="text-[10px] text-gray-400">
              {(v.performedAt || v.createdAt)
                ? new Date(v.performedAt || v.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ParticipantsSection({
  challengeId,
  managerIds = [],
}: {
  challengeId: string;
  managerIds?: string[];
}) {
  const navigate = useNavigate();
  const [openPostsUserId, setOpenPostsUserId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery<LeaderParticipantsData>({
    queryKey: ['leader-participants', challengeId],
    queryFn: async () => {
      const res = await apiClient.get(`/c/${challengeId}/leader/participants`);
      return res.data.data;
    },
  });

  // 대기 중 인정 요청 — 참여자별·날짜별로 그리드에 표시
  const { data: pendingReqs = [] } = useQuery<any[]>({
    queryKey: ['leader-completion-requests', challengeId, 'pending'],
    queryFn: () => challengeApi.getLeaderCompletionRequests(challengeId, 'pending'),
  });
  const requestsByUser = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of pendingReqs) {
      if (r.status !== 'pending') continue;
      const list = map.get(String(r.userId)) ?? [];
      list.push(r);
      map.set(String(r.userId), list);
    }
    return map;
  }, [pendingReqs]);

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
                      {managerIds.includes(String(p.userId)) && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-indigo-100 text-indigo-700">🛡️ 매니저</span>
                      )}
                      {(requestsByUser.get(String(p.userId))?.length ?? 0) > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-indigo-50 text-indigo-600">
                          🙋 인정요청 {requestsByUser.get(String(p.userId))!.length}
                        </span>
                      )}
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
                  <button
                    type="button"
                    onClick={() => navigate(`/dm/${challengeId}/${p.userId}`)}
                    className="ml-auto rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    💬 DM
                  </button>
                </div>
                <ParticipantDayGrid
                  challengeId={challengeId}
                  participant={p}
                  pendingRequests={requestsByUser.get(String(p.userId)) ?? []}
                />
                {/* 일자별 게시물 요약 — 작은 이미지·내용 일부·인증시간 */}
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenPostsUserId((cur) => (cur === String(p.userId) ? null : String(p.userId)))}
                    className="text-[11px] font-semibold text-gray-500 flex items-center gap-1"
                  >
                    게시물 요약 {openPostsUserId === String(p.userId) ? '▲' : '▼'}
                  </button>
                  {openPostsUserId === String(p.userId) && (
                    <ParticipantPostsSummary challengeId={challengeId} participantId={String(p.userId)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const VERIFICATION_TYPE_OPTIONS: Array<{ key: 'image' | 'video' | 'link' | 'text'; label: string }> = [
  { key: 'image', label: '📸 사진' },
  { key: 'video', label: '🎬 영상' },
  { key: 'link', label: '🔗 링크' },
  { key: 'text', label: '📝 텍스트' },
];

// 공통 리더퀘스트 등록 — 리더가 전체 참여자 공통 퀘스트를 운영탭에서 추가.
function LeaderQuestCreateSection({
  challengeId,
  challengeType,
  allowedVerificationTypes,
}: {
  challengeId: string;
  challengeType: string;
  allowedVerificationTypes?: Array<'image' | 'video' | 'link' | 'text'>;
}) {
  const queryClient = useQueryClient();
  // 챌린지가 허용한 인증 방식만 리더퀘스트에 쓸 수 있다 (나머지는 비활성).
  const allowedList = allowedVerificationTypes && allowedVerificationTypes.length
    ? allowedVerificationTypes
    : (['image', 'text', 'link', 'video'] as const);
  const allowedSet = new Set<'image' | 'video' | 'link' | 'text'>(allowedList);
  // 리더 퀘스트를 진행하지 않는 챌린지(개인 전용)면 등록 UI를 막는다.
  const notLeaderChallenge = challengeType === 'personal_only';

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [types, setTypes] = useState<Set<'image' | 'video' | 'link' | 'text'>>(new Set(allowedSet));
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [targetTime, setTargetTime] = useState('');

  const reset = () => {
    setTitle('');
    setDescription('');
    setTypes(new Set(allowedSet));
    setApprovalRequired(false);
    setTargetTime('');
  };

  const createMutation = useMutation({
    mutationFn: () =>
      challengeApi.createLeaderQuest(challengeId, {
        title: title.trim(),
        description: description.trim(),
        allowedVerificationTypes: Array.from(types),
        approvalRequired,
        targetTime: targetTime || undefined,
      }),
    onSuccess: () => {
      toast.success('공통 리더퀘스트가 등록됐어요 🎯');
      reset();
      setOpen(false);
      // 피드/보드/관리 목록 갱신
      queryClient.invalidateQueries({ queryKey: ['challenge-quests', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['quests', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['leader-quests-manage', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['leader-briefing', challengeId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '등록에 실패했어요'),
  });

  const toggleType = (key: 'image' | 'video' | 'link' | 'text') => {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // 최소 1개 유지
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && types.size > 0;

  return (
    <section className="glass-card rounded-2xl p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between"
      >
        <h3 className="font-bold text-gray-900">🎯 공통 리더퀘스트 등록</h3>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {notLeaderChallenge ? (
        <p className="text-sm text-gray-500 mt-2">
          이 챌린지는 <b>리더 퀘스트를 진행하지 않아요</b> (개인 퀘스트 전용). 리더퀘스트 등록이 필요 없어요.
        </p>
      ) : (
        <p className="text-[11px] text-gray-400 mt-1">전체 참여자가 공통으로 수행하는 리더퀘스트를 추가합니다.</p>
      )}

      {!notLeaderChallenge && open && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600">퀘스트 제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="예: 아침 물 한 잔 마시기"
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">설명 · 인증 가이드</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="참여자에게 보여줄 퀘스트 설명과 인증 방법을 적어주세요."
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">인증 방식</label>
            <p className="text-[11px] text-gray-400 mt-0.5">챌린지에서 허용한 방식만 선택할 수 있어요.</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {VERIFICATION_TYPE_OPTIONS.map((opt) => {
                const isAllowed = allowedSet.has(opt.key);
                const active = isAllowed && types.has(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={!isAllowed}
                    onClick={() => isAllowed && toggleType(opt.key)}
                    title={isAllowed ? undefined : '이 챌린지에서 허용하지 않은 인증 방식이에요'}
                    className={[
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      !isAllowed
                        ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed line-through'
                        : active
                          ? 'bg-primary-50 border-primary-300 text-primary-700'
                          : 'bg-white border-gray-200 text-gray-500',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600">목표 시각 (선택)</label>
              <input
                type="time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-5">
              <input
                type="checkbox"
                checked={approvalRequired}
                onChange={(e) => setApprovalRequired(e.target.checked)}
              />
              <span className="text-xs text-gray-700">리더 승인 후 인정</span>
            </label>
          </div>

          <button
            type="button"
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="w-full py-2.5 rounded-xl bg-primary-600 text-white font-semibold text-sm disabled:opacity-50"
          >
            {createMutation.isPending ? '등록 중...' : '리더퀘스트 등록'}
          </button>
        </div>
      )}
    </section>
  );
}

// ── 리더퀘스트 관리 (진행중/중단 목록 + 수정·중단·삭제) ──────────────────────
function LeaderQuestManageSection({
  challengeId,
  challengeType,
  allowedVerificationTypes,
  managerMode = false,
}: {
  challengeId: string;
  challengeType: string;
  allowedVerificationTypes?: Array<'image' | 'video' | 'link' | 'text'>;
  managerMode?: boolean;
}) {
  const notLeaderChallenge = challengeType === 'personal_only';
  const { data: quests = [], isLoading } = useQuery<any[]>({
    queryKey: ['leader-quests-manage', challengeId],
    enabled: !notLeaderChallenge && Boolean(challengeId),
    // 실제 인증(questId 연결) 수를 포함한 리더 전용 목록 — 인증 이동 후에도 정확
    queryFn: () => challengeApi.listLeaderQuests(challengeId),
  });

  if (notLeaderChallenge) return null;

  return (
    <section className="glass-card rounded-2xl p-5">
      <h3 className="font-bold text-gray-900">🛠️ 리더퀘스트 관리</h3>
      <p className="text-[11px] text-gray-400 mt-1">진행 중인 리더퀘스트를 수정·중단·삭제할 수 있어요.</p>

      {isLoading ? (
        <p className="text-sm text-gray-400 mt-3">불러오는 중...</p>
      ) : quests.length === 0 ? (
        <p className="text-sm text-gray-400 mt-3">아직 등록한 리더퀘스트가 없어요.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {quests.map((q) => (
            <LeaderQuestManageRow
              key={q.questId}
              challengeId={challengeId}
              quest={q}
              allowedVerificationTypes={allowedVerificationTypes}
              managerMode={managerMode}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LeaderQuestManageRow({
  challengeId,
  quest,
  allowedVerificationTypes,
  managerMode = false,
}: {
  challengeId: string;
  quest: any;
  allowedVerificationTypes?: Array<'image' | 'video' | 'link' | 'text'>;
  managerMode?: boolean;
}) {
  const queryClient = useQueryClient();
  const allowedList = allowedVerificationTypes && allowedVerificationTypes.length
    ? allowedVerificationTypes
    : (['image', 'text', 'link', 'video'] as const);
  const allowedSet = new Set<'image' | 'video' | 'link' | 'text'>(allowedList);

  const isActive = quest.status !== 'inactive';
  // 실제 이 퀘스트에 연결된 인증 수(questId 기준). 이동 후에도 정확.
  const verificationCount = Number(quest.verificationCount ?? 0);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(quest.title ?? '');
  const [description, setDescription] = useState(quest.description ?? '');
  const [types, setTypes] = useState<Set<'image' | 'video' | 'link' | 'text'>>(
    new Set((quest.allowedVerificationTypes ?? Array.from(allowedSet)) as Array<'image' | 'video' | 'link' | 'text'>),
  );
  const [approvalRequired, setApprovalRequired] = useState(Boolean(quest.approvalRequired));
  const [targetTime, setTargetTime] = useState<string>(quest.targetTime ?? '');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['leader-quests-manage', challengeId] });
    queryClient.invalidateQueries({ queryKey: ['challenge-quests', challengeId] });
    queryClient.invalidateQueries({ queryKey: ['quests', challengeId] });
    queryClient.invalidateQueries({ queryKey: ['leader-briefing', challengeId] });
    // 삭제/중단 시 지난 날짜 완료·점수가 재계산되므로 참여자 진행현황·내 챌린지도 갱신
    queryClient.invalidateQueries({ queryKey: ['leader-participants', challengeId] });
    queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
    queryClient.invalidateQueries({ queryKey: ['challenge-feed-verifications', challengeId] });
  };

  const updateMutation = useMutation({
    mutationFn: (params: Parameters<typeof challengeApi.updateLeaderQuest>[2]) =>
      challengeApi.updateLeaderQuest(challengeId, quest.questId, params),
    onSuccess: (_d, params) => {
      toast.success(
        params.status === 'inactive' ? '중단했어요' : params.status === 'active' ? '재개했어요' : '수정했어요',
      );
      setEditing(false);
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '변경에 실패했어요'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => challengeApi.deleteLeaderQuest(challengeId, quest.questId),
    onSuccess: () => {
      toast.success('삭제했어요');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '삭제에 실패했어요'),
  });

  const toggleType = (key: 'image' | 'video' | 'link' | 'text') => {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const onDelete = () => {
    // 인증이 연결돼 있으면 삭제 불가(서버도 409로 막음) — 이동/중단 안내
    if (verificationCount > 0) {
      window.alert(
        `이 퀘스트에 인증 ${verificationCount}건이 연결돼 있어 삭제할 수 없어요.\n인증을 다른 퀘스트로 옮기거나 '중단'하세요.`,
      );
      return;
    }
    if (window.confirm('이 리더퀘스트를 삭제할까요?')) deleteMutation.mutate();
  };

  const busy = updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className={`rounded-xl border p-3 ${isActive ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {isActive ? '진행중' : '중단됨'}
            </span>
            <p className="text-sm font-semibold text-gray-900 truncate">{quest.title}</p>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">인증 {verificationCount}건{quest.targetTime ? ` · 목표 ${quest.targetTime}` : ''}</p>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={3}
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300 resize-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {VERIFICATION_TYPE_OPTIONS.map((opt) => {
              const allowed = allowedSet.has(opt.key);
              const active = allowed && types.has(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={!allowed}
                  onClick={() => allowed && toggleType(opt.key)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    !allowed
                      ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed line-through'
                      : active
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-gray-200 text-gray-500',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-[11px] font-semibold text-gray-600">목표 시각</label>
              <input
                type="time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-5">
              <input type="checkbox" checked={approvalRequired} onChange={(e) => setApprovalRequired(e.target.checked)} />
              <span className="text-xs text-gray-700">리더 승인 후 인정</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !title.trim() || !description.trim() || types.size === 0}
              onClick={() =>
                updateMutation.mutate({
                  title: title.trim(),
                  description: description.trim(),
                  allowedVerificationTypes: Array.from(types),
                  approvalRequired,
                  targetTime: targetTime || undefined,
                })
              }
              className="flex-1 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            수정
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => updateMutation.mutate({ status: isActive ? 'inactive' : 'active' })}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${
              isActive ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
          >
            {isActive ? '중단' : '재개'}
          </button>
          {!managerMode && (
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              title={verificationCount > 0 ? '인증이 있어 삭제할 수 없어요 (이동/중단 후 가능)' : '삭제'}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                verificationCount > 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-500'
              }`}
            >
              삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const PROPOSAL_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '검토중', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: '승인됨', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '반려', cls: 'bg-rose-100 text-rose-700' },
};

// 인증 완료 인정 요청 심사 — 사용자가 '이 게시물을 N일차 인증으로 인정해달라'고 보낸 요청 처리
function CompletionRequestSection({ challengeId }: { challengeId: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ['leader-completion-requests', challengeId, tab],
    queryFn: () => challengeApi.getLeaderCompletionRequests(challengeId, tab),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: 'approve' | 'reject' }) =>
      challengeApi.resolveCompletionRequest(challengeId, requestId, { decision }),
    onSuccess: (_d, vars) => {
      toast.success(vars.decision === 'approve' ? '인정 처리했어요 (+1점)' : '요청을 반려했어요');
      queryClient.invalidateQueries({ queryKey: ['leader-completion-requests', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['leader-participants', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['leader-briefing', challengeId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '처리에 실패했어요'),
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900">🙋 인증 인정 요청 {pendingCount > 0 && <span className="text-xs text-rose-500">({pendingCount})</span>}</h3>
        <div className="flex gap-1">
          {(['pending', 'all'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`text-[11px] px-2 py-1 rounded-full ${tab === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t === 'pending' ? '대기' : '전체'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-500">요청이 없어요.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => {
            const meta = PROPOSAL_STATUS_META[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-500' };
            const busy = resolveMutation.isPending && resolveMutation.variables?.requestId === r.requestId;
            return (
              <div key={r.requestId} className="rounded-xl bg-white/60 border border-gray-100 p-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">{r.day}일차</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                  <span className="ml-auto text-[11px] text-gray-400">{maskUserId(r.userId)}</span>
                </div>
                {r.message && <p className="text-[12px] text-gray-600 mt-1 whitespace-pre-wrap">{r.message}</p>}
                <p className="text-[10px] text-gray-400 mt-0.5">{r.createdAt ? new Date(r.createdAt).toLocaleString('ko-KR') : ''}</p>
                {r.status === 'pending' && (
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => resolveMutation.mutate({ requestId: r.requestId, decision: 'approve' })}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white disabled:opacity-50"
                    >
                      ✅ 완료 인정 (+1점)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => resolveMutation.mutate({ requestId: r.requestId, decision: 'reject' })}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 disabled:opacity-50"
                    >
                      반려
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// 개인 퀘스트 제안 심사 섹션 — 기본 자동승인이지만 수동검토 챌린지·재검토용.
function ProposalReviewSection({
  challengeId,
  challengeType,
  personalQuestEnabled,
}: {
  challengeId: string;
  challengeType: string;
  personalQuestEnabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  // 승인된 제안 재반려 시, 재제출 미이행 처리(fallback) 선택
  const [fallback, setFallback] = useState<'block' | 'keep_original'>('block');

  const { data, isLoading, isError } = useQuery<{ proposals: QuestProposal[]; total: number }>({
    queryKey: ['leader-quest-proposals', challengeId, tab],
    queryFn: () => challengeApi.getLeaderQuestProposals(challengeId, tab),
  });

  const reviewMutation = useMutation({
    mutationFn: (vars: { proposalId: string; decision: 'approve' | 'reject'; reason?: string }) =>
      challengeApi.reviewQuestProposal(challengeId, vars.proposalId, {
        decision: vars.decision,
        reason: vars.reason,
      }),
    onSuccess: (_res, vars) => {
      toast.success(vars.decision === 'approve' ? '승인했어요' : '반려했어요');
      setRejectingId(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['leader-quest-proposals', challengeId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '처리에 실패했어요'),
  });

  // 이미 승인된 '제안' 재반려 — 참여자가 재제출하게 함 (개별 인증 게시물은 피드에서 각각 반려)
  const reRejectMutation = useMutation({
    mutationFn: (vars: { proposalId: string; reason?: string; fallback: 'block' | 'keep_original' }) =>
      challengeApi.reRejectQuestProposal(challengeId, vars.proposalId, { reason: vars.reason, fallback: vars.fallback }),
    onSuccess: () => {
      toast.success('제안을 반려했어요');
      setRejectingId(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['leader-quest-proposals', challengeId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '처리에 실패했어요'),
  });

  const proposals = data?.proposals ?? [];

  // 개인 퀘스트를 진행하지 않는 챌린지(리더 전용 or 비활성)면 심사 UI 대신 안내.
  const noPersonalQuest = challengeType === 'leader_only' || personalQuestEnabled === false;
  if (noPersonalQuest) {
    return (
      <section className="glass-card rounded-2xl p-5">
        <h3 className="font-bold text-gray-900">📝 개인 퀘스트 제안 심사</h3>
        <p className="text-sm text-gray-500 mt-2">
          이 챌린지는 <b>개인 퀘스트를 진행하지 않아요</b>. 심사할 제안이 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900">📝 개인 퀘스트 제안 심사</h3>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['pending', 'all'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {t === 'pending' ? '대기' : '전체'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <p className="text-sm text-gray-500">제안을 불러오지 못했어요.</p>
      ) : proposals.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          {tab === 'pending' ? '대기 중인 제안이 없어요. (기본 자동승인)' : '아직 제안이 없어요.'}
        </p>
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => {
            const meta = PROPOSAL_STATUS_META[p.status] ?? { label: p.status, cls: 'bg-gray-100 text-gray-500' };
            const isRejecting = rejectingId === p.proposalId;
            const isPending = p.status === 'pending';
            const isApproved = p.status === 'approved';
            const busy = reviewMutation.isPending || reRejectMutation.isPending;
            return (
              <div key={p.proposalId} className="rounded-xl bg-white/60 border border-gray-100 p-3">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-[11px] font-bold text-primary-700 flex-shrink-0">
                    {p.userId?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.title}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">{maskUserId(p.userId)}</p>
                    {p.description && (
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed whitespace-pre-wrap break-words">{p.description}</p>
                    )}
                    {p.leaderFeedback && (
                      <p className="text-[11px] text-rose-600 bg-rose-50 rounded-lg px-2 py-1 mt-1">💬 {p.leaderFeedback}</p>
                    )}
                  </div>
                </div>

                {(isPending || isApproved) && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    {isRejecting ? (
                      <div className="space-y-2">
                        {isApproved && (
                          <p className="text-[11px] text-rose-600 bg-rose-50 rounded-lg px-2 py-1.5">
                            ⚠️ 이미 승인된 <b>퀘스트 제안</b>을 반려하면 참여자에게 사유가 전달되고 다시 제출하도록 안내돼요.
                            (이미 올라온 인증 게시물은 피드에서 각각 <b>반려</b>로 처리하세요.)
                          </p>
                        )}
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={isApproved ? '반려 사유 (참여자에게 전달, 선택)' : '반려 사유(선택)'}
                          maxLength={500}
                          className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-rose-300"
                        />
                        {isApproved && (
                          <div className="rounded-lg border border-gray-200 p-2 space-y-1.5">
                            <p className="text-[11px] font-semibold text-gray-600">시작 전까지 재제출하지 않으면?</p>
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input type="radio" name={`fb-${p.proposalId}`} checked={fallback === 'block'} onChange={() => setFallback('block')} className="mt-0.5" />
                              <span className="text-[11px] text-gray-700"><b>참여 제한</b> — 개인 퀘스트 미승인으로 이 챌린지 참여 불가</span>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input type="radio" name={`fb-${p.proposalId}`} checked={fallback === 'keep_original'} onChange={() => setFallback('keep_original')} className="mt-0.5" />
                              <span className="text-[11px] text-gray-700"><b>기존 제출본 유지</b> — 원래 승인본으로 자동 재승인</span>
                            </label>
                            <p className="text-[10px] text-gray-400">※ 재제출하면 두 경우 모두 시작 전 자동 재승인돼요.</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              isApproved
                                ? reRejectMutation.mutate({ proposalId: p.proposalId, reason: reason.trim() || undefined, fallback })
                                : reviewMutation.mutate({ proposalId: p.proposalId, decision: 'reject', reason: reason.trim() || undefined })
                            }
                            className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white disabled:opacity-50"
                          >
                            {isApproved ? '제안 반려' : '반려 확정'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRejectingId(null); setReason(''); }}
                            className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : isPending ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => reviewMutation.mutate({ proposalId: p.proposalId, decision: 'approve' })}
                          className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRejectingId(p.proposalId); setReason(''); }}
                          className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-rose-200 text-rose-600 bg-white"
                        >
                          반려
                        </button>
                      </div>
                    ) : (
                      // 이미 승인됨 — 제안 반려 진입 (참여자 재제출)
                      <button
                        type="button"
                        onClick={() => { setRejectingId(p.proposalId); setReason(''); }}
                        className="w-full py-1.5 text-xs font-medium rounded-lg border border-rose-200 text-rose-600 bg-white"
                      >
                        제안 반려하기
                      </button>
                    )}
                  </div>
                )}
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

// ── 매니저 관리 (리더 전용) ────────────────────────────────────────────────
//  참여 신청 이상인 사람 중 지정(최대 3명). 종료 후에도 유지, 포기/삭제급 권한은 없음.
function ManagerSection({
  challengeId,
  managerIds,
  onChanged,
}: {
  challengeId: string;
  managerIds: string[];
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery<LeaderParticipantsData>({
    queryKey: ['leader-participants', challengeId],
    queryFn: async () => {
      const res = await apiClient.get(`/c/${challengeId}/leader/participants`);
      return res.data.data;
    },
  });

  const manageMutation = useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: 'assign' | 'remove' }) =>
      apiClient.put(`/c/${challengeId}/leader/managers`, { userId, action }),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === 'assign' ? '매니저로 지정했어요 🛡️' : '매니저를 해임했어요');
      queryClient.invalidateQueries({ queryKey: ['leader-participants', challengeId] });
      onChanged?.();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '처리에 실패했어요'),
  });

  const participants = (data?.participants ?? []).filter(
    (p) => p.status !== 'gave_up',
  );
  const candidates = participants.filter((p) => !managerIds.includes(String(p.userId)));

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900">🛡️ 매니저 관리</h3>
        <span className="text-xs text-gray-400">{managerIds.length}/3</span>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        참여자 중에서 운영을 도울 매니저를 지정해요. 매니저는 완료 인정·심사·티켓·선물까지 운영할 수 있지만,
        해산·삭제 같은 결정은 할 수 없어요. 챌린지 종료 후에도 유지됩니다.
      </p>

      {managerIds.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {managerIds.map((id) => (
            <div key={id} className="flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
              <span className="text-sm">🛡️</span>
              <span className="text-xs font-semibold text-indigo-800 flex-1">{maskUserId(id)}</span>
              <button
                type="button"
                disabled={manageMutation.isPending}
                onClick={() => {
                  if (window.confirm('이 매니저를 해임할까요?')) manageMutation.mutate({ userId: id, action: 'remove' });
                }}
                className="text-[11px] font-semibold text-gray-400 hover:text-rose-500 disabled:opacity-50"
              >
                해임
              </button>
            </div>
          ))}
        </div>
      )}

      {managerIds.length < 3 && candidates.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-600 mb-1.5">참여자에서 지정</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {candidates.map((p) => (
              <div key={p.userChallengeId} className="flex items-center gap-2 rounded-lg bg-white/60 border border-gray-100 px-3 py-1.5">
                <span className="text-xs text-gray-700 flex-1 truncate">{maskUserId(p.userId)}</span>
                <button
                  type="button"
                  disabled={manageMutation.isPending}
                  onClick={() => manageMutation.mutate({ userId: String(p.userId), action: 'assign' })}
                  className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
                >
                  지정
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── 참여 티켓 운영 (리더, 유료 챌린지 전용) ────────────────────────────────
//  운영자에게 배부받은 할당량으로 유저에게 티켓 발급(신청 승인 or 직접 부여).
//  티켓은 결제와 동일 효력 — 유저가 사용하면 amount=0 paid 주문으로 참여한다.
function TicketSection({ challengeId }: { challengeId: string }) {
  const queryClient = useQueryClient();
  const [directUserId, setDirectUserId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leader-tickets', challengeId],
    queryFn: async () => {
      const res = await apiClient.get(`/pay/tickets/leader/${challengeId}`);
      return res.data.data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['leader-tickets', challengeId] });

  const grantMutation = useMutation({
    mutationFn: ({ toUserId, fromRequest }: { toUserId: string; fromRequest?: boolean }) =>
      apiClient.post(`/pay/tickets/leader/${challengeId}/grant`, { toUserId, ...(fromRequest ? { fromRequest: true } : {}) }),
    onSuccess: () => {
      toast.success('티켓을 발급했어요 🎫');
      setDirectUserId('');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '발급에 실패했어요'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      apiClient.post(`/pay/tickets/leader/${challengeId}/requests/${userId}/reject`, reason ? { reason } : {}),
    onSuccess: () => {
      toast.success('신청을 반려했어요');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '반려에 실패했어요'),
  });

  const quota = data?.quota ?? { total: 0, issued: 0, remaining: 0 };
  const pending = (data?.requests ?? []).filter((r: any) => r.status === 'pending');
  const issuedTickets = (data?.tickets ?? []) as any[];
  const busy = grantMutation.isPending || rejectMutation.isPending;

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900">🎫 참여 티켓</h3>
        <span className="text-xs text-gray-400">
          잔여 {quota.remaining} / 배부 {quota.total}
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        티켓은 결제와 동일한 효력이에요. 유저가 사용하면 무료로 참여가 확정됩니다. 할당량이 부족하면 운영자에게 추가 배부를 요청하세요.
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400 mt-3">불러오는 중...</p>
      ) : (
        <>
          {/* 신청 큐 */}
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-600">
              티켓 신청 {pending.length > 0 && <span className="text-rose-500">({pending.length})</span>}
            </p>
            {pending.length === 0 ? (
              <p className="text-xs text-gray-400 mt-1.5">대기 중인 신청이 없어요.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {pending.map((r: any) => (
                  <div key={r.userId} className="rounded-xl bg-white/60 border border-gray-100 p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">{maskUserId(String(r.userId))}</p>
                      <span className="ml-auto text-[11px] text-gray-400">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString('ko-KR') : ''}
                      </span>
                    </div>
                    {r.message && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{r.message}</p>}
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        disabled={busy || quota.remaining <= 0}
                        onClick={() => grantMutation.mutate({ toUserId: String(r.userId), fromRequest: true })}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 text-white disabled:opacity-50"
                        title={quota.remaining <= 0 ? '잔여 할당량이 없어요' : undefined}
                      >
                        🎫 티켓 발급
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt('반려 사유 (선택)') ?? undefined;
                          rejectMutation.mutate({ userId: String(r.userId), reason: reason?.trim() || undefined });
                        }}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 disabled:opacity-50"
                      >
                        반려
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 직접 발급 */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600">특정 유저에게 직접 발급</p>
            <div className="mt-1.5 flex gap-2">
              <input
                value={directUserId}
                onChange={(e) => setDirectUserId(e.target.value)}
                placeholder="유저 ID"
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300"
              />
              <button
                type="button"
                disabled={busy || !directUserId.trim() || quota.remaining <= 0}
                onClick={() => grantMutation.mutate({ toUserId: directUserId.trim() })}
                className="px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                발급
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">유저 ID 확인이 어려우면 유저에게 결제 화면의 '티켓 신청'을 안내하세요.</p>
          </div>

          {/* 발급 현황 */}
          {issuedTickets.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600">발급 현황 ({issuedTickets.length})</p>
              <div className="mt-1.5 space-y-1">
                {issuedTickets.slice(0, 10).map((t: any) => (
                  <div key={t.ticketId} className="flex items-center gap-2 text-xs text-gray-600">
                    <span>{maskUserId(String(t.userId))}</span>
                    <span
                      className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        t.status === 'consumed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {t.status === 'consumed' ? '사용 완료(참여)' : '미사용'}
                    </span>
                  </div>
                ))}
                {issuedTickets.length > 10 && <p className="text-[10px] text-gray-400">+{issuedTickets.length - 10}건 더</p>}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── 완주 보상 상품 카탈로그 (리더/매니저) ──────────────────────────────────
//  실물/기프티콘/온라인 서비스 분류 + 정사각 이미지·설명 등록.
//  등록된 상품은 챌린지 리스트 카드의 동그라미와 보상 상세 페이지(/challenges/:id/reward)에 노출된다.
const REWARD_TYPE_META: Record<string, { label: string; emoji: string }> = {
  physical: { label: '실물 상품', emoji: '📦' },
  gifticon: { label: '온라인 상품 (기프티콘)', emoji: '🎟️' },
  service: { label: '온라인 상품 (서비스)', emoji: '💻' },
};

type RewardProductDraft = {
  productId?: string;
  type: 'physical' | 'gifticon' | 'service';
  name: string;
  description: string;
  imageUrl: string;
};

function RewardProductsSection({ challengeId }: { challengeId: string }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<RewardProductDraft[] | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  const { data: challenge } = useQuery<any>({
    queryKey: ['challenge-feed', challengeId],
    queryFn: async () => {
      const res = await apiClient.get(`/public/challenges/${challengeId}`);
      return res.data?.data;
    },
  });

  const products: RewardProductDraft[] =
    drafts ??
    ((challenge?.rewardProducts ?? []) as any[]).map((p) => ({
      productId: p.productId,
      type: p.type ?? 'physical',
      name: p.name ?? '',
      description: p.description ?? '',
      imageUrl: p.imageUrl ?? '',
    }));

  const setProducts = (next: RewardProductDraft[]) => setDrafts(next);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.put(`/c/${challengeId}/leader/reward-products`, {
        products: products
          .filter((p) => p.name.trim())
          .map((p) => ({
            ...(p.productId ? { productId: p.productId } : {}),
            type: p.type,
            name: p.name.trim(),
            ...(p.description.trim() ? { description: p.description.trim() } : {}),
            ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
          })),
      }),
    onSuccess: () => {
      toast.success('완주 보상 상품을 저장했어요 🎁');
      setDrafts(null);
      queryClient.invalidateQueries({ queryKey: ['challenge-feed', challengeId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '저장에 실패했어요'),
  });

  const uploadImage = async (idx: number, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있어요');
      return;
    }
    setUploadingIdx(idx);
    try {
      const { data: up } = await apiClient.post(`/c/${challengeId}/leader/reward-products/upload-url`, {
        fileType: file.type,
        fileSize: file.size,
      });
      await fetch(up.data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      const next = [...products];
      next[idx] = { ...next[idx], imageUrl: up.data.fileUrl };
      setProducts(next);
      toast.success('이미지를 올렸어요. 저장을 눌러 반영하세요');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '이미지 업로드에 실패했어요');
    } finally {
      setUploadingIdx(null);
    }
  };

  return (
    <section className="glass-card rounded-2xl p-5">
      <h3 className="font-bold text-gray-900">🎁 완주 보상 상품 등록</h3>
      <p className="text-[11px] text-gray-400 mt-1">
        실물/기프티콘/온라인 서비스 상품을 등록하면 챌린지 리스트에 <b>동그라미 상품 이미지</b>가 붙고,
        누르면 상품·조건·참여 버튼이 있는 페이지가 열려요. 이미지는 <b>정사각형</b> 권장.
      </p>

      <div className="mt-3 space-y-3">
        {products.map((p, idx) => (
          <div key={p.productId ?? idx} className="rounded-xl border border-gray-200 bg-white/60 p-3 space-y-2">
            <div className="flex items-center gap-2">
              {/* 정사각 이미지 업로드 */}
              <label className="relative w-16 h-16 rounded-xl overflow-hidden border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center cursor-pointer flex-shrink-0">
                {p.imageUrl ? (
                  <img src={resolveMediaUrl(p.imageUrl)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">{REWARD_TYPE_META[p.type]?.emoji ?? '🎁'}</span>
                )}
                {uploadingIdx === idx && (
                  <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-[10px] text-white">업로드중</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(idx, f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <div className="flex-1 min-w-0 space-y-1.5">
                <select
                  value={p.type}
                  onChange={(e) => {
                    const next = [...products];
                    next[idx] = { ...next[idx], type: e.target.value as RewardProductDraft['type'] };
                    setProducts(next);
                  }}
                  className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
                >
                  <option value="physical">📦 실물 상품</option>
                  <option value="gifticon">🎟️ 온라인 상품 (기프티콘)</option>
                  <option value="service">💻 온라인 상품 (서비스)</option>
                </select>
                <input
                  value={p.name}
                  onChange={(e) => {
                    const next = [...products];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setProducts(next);
                  }}
                  maxLength={60}
                  placeholder="상품 이름"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300"
                />
              </div>
              <button
                type="button"
                onClick={() => setProducts(products.filter((_, i) => i !== idx))}
                className="text-[11px] text-gray-400 hover:text-rose-500 flex-shrink-0"
              >
                삭제
              </button>
            </div>
            <textarea
              value={p.description}
              onChange={(e) => {
                const next = [...products];
                next[idx] = { ...next[idx], description: e.target.value };
                setProducts(next);
              }}
              rows={2}
              maxLength={500}
              placeholder="상품 설명 (수량·브랜드·유의사항 등)"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300 resize-none"
            />
          </div>
        ))}

        {products.length < 6 && (
          <button
            type="button"
            onClick={() => setProducts([...products, { type: 'physical', name: '', description: '', imageUrl: '' }])}
            className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-gray-500 hover:border-primary-300 hover:text-primary-600"
          >
            + 상품 추가
          </button>
        )}

        {(drafts !== null || products.length > 0) && (
          <button
            type="button"
            disabled={saveMutation.isPending || uploadingIdx !== null}
            onClick={() => saveMutation.mutate()}
            className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saveMutation.isPending ? '저장 중...' : '보상 상품 저장'}
          </button>
        )}
      </div>
    </section>
  );
}

// ── 완주 선물 발송 (리더) ──────────────────────────────────────────────────
//  완주자에게 선물 교환권 발송 — 미리 등록(카탈로그)+일괄 발송 또는 즉석 입력 개별 발송.
//  교환권 만료 기본 30일, 지급(교환 신청) 전까지 수정 가능. 실물은 claim 시 유저가
//  배송 정보를 입력하고, 리더가 발송 처리(ship)한다.
function GiftSection({ challengeId }: { challengeId: string }) {
  const queryClient = useQueryClient();
  const [giftName, setGiftName] = useState('');
  const [giftDesc, setGiftDesc] = useState('');
  const [giftType, setGiftType] = useState<'digital' | 'physical'>('digital');
  const [selectedGiftId, setSelectedGiftId] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['leader-gifts', challengeId],
    queryFn: async () => {
      const res = await apiClient.get(`/pay/gifts/leader/${challengeId}`);
      return res.data.data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['leader-gifts', challengeId] });

  const addCatalogMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/pay/gifts/leader/${challengeId}/catalog`, {
        name: giftName.trim(),
        ...(giftDesc.trim() ? { description: giftDesc.trim() } : {}),
        type: giftType,
      }),
    onSuccess: () => {
      toast.success('선물을 등록했어요');
      setGiftName('');
      setGiftDesc('');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '등록에 실패했어요'),
  });

  const deleteCatalogMutation = useMutation({
    mutationFn: (giftId: string) => apiClient.delete(`/pay/gifts/leader/${challengeId}/catalog/${giftId}`),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err?.response?.data?.message || '삭제에 실패했어요'),
  });

  const sendBatchMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/pay/gifts/leader/${challengeId}/send-batch`, {
        giftId: selectedGiftId,
        userIds: Array.from(selectedUsers),
      }),
    onSuccess: (res: any) => {
      toast.success(res?.data?.message || '선물을 보냈어요 🎁');
      setSelectedUsers(new Set());
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '발송에 실패했어요'),
  });

  const shipMutation = useMutation({
    mutationFn: ({ voucherId, trackingInfo }: { voucherId: string; trackingInfo?: string }) =>
      apiClient.post(`/pay/gifts/leader/${challengeId}/vouchers/${voucherId}/ship`, trackingInfo ? { trackingInfo } : {}),
    onSuccess: () => {
      toast.success('발송 처리했어요 📦');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '발송 처리에 실패했어요'),
  });

  const editExpiryMutation = useMutation({
    mutationFn: ({ voucherId, expiresAt }: { voucherId: string; expiresAt: string }) =>
      apiClient.patch(`/pay/gifts/leader/${challengeId}/vouchers/${voucherId}`, { expiresAt }),
    onSuccess: () => {
      toast.success('만료일을 수정했어요');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '수정에 실패했어요'),
  });

  const catalog = (data?.catalog ?? []) as any[];
  const completers = (data?.completers ?? []) as any[];
  const vouchers = (data?.vouchers ?? []) as any[];
  const vouchersByUser = new Map<string, any[]>();
  for (const v of vouchers) {
    const list = vouchersByUser.get(String(v.userId)) ?? [];
    list.push(v);
    vouchersByUser.set(String(v.userId), list);
  }
  const claimedPhysical = vouchers.filter((v) => v.status === 'claimed' && v.type === 'physical');
  const busy =
    addCatalogMutation.isPending || sendBatchMutation.isPending || shipMutation.isPending || deleteCatalogMutation.isPending;

  const toggleUser = (userId: string) =>
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const VOUCHER_STATUS_LABEL: Record<string, string> = {
    issued: '발송됨(미교환)',
    claimed: '교환 신청',
    shipped: '배송중',
    delivered: '수령 완료',
    expired: '만료',
  };

  return (
    <section className="glass-card rounded-2xl p-5">
      <h3 className="font-bold text-gray-900">🎁 완주 선물</h3>
      <p className="text-[11px] text-gray-400 mt-1">
        완주자에게 선물 교환권을 보내요. 만료는 발행 후 30일(교환 전까지 수정 가능), 실물은 유저가 배송지를 입력하면 발송 처리해요.
      </p>

      {isLoading ? (
        <p className="text-sm text-gray-400 mt-3">불러오는 중...</p>
      ) : (
        <>
          {/* 배송 대기 알림 — 실물 교환 신청 건 */}
          {claimedPhysical.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
              <p className="text-xs font-bold text-amber-800">📦 배송 대기 {claimedPhysical.length}건</p>
              {claimedPhysical.map((v) => (
                <div key={v.voucherId} className="rounded-lg bg-white border border-amber-100 p-2.5">
                  <p className="text-xs font-semibold text-gray-800">
                    {v.giftName} → {maskUserId(String(v.userId))}
                  </p>
                  {v.recipient && (
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {v.recipient.name} · {v.recipient.phone}
                      <span className="block">{v.recipient.address}</span>
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const tracking = window.prompt('운송장/배송 메모 (선택)') ?? undefined;
                      shipMutation.mutate({ voucherId: v.voucherId, trackingInfo: tracking?.trim() || undefined });
                    }}
                    className="mt-1.5 w-full py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-semibold disabled:opacity-50"
                  >
                    발송 완료 처리
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 선물 카탈로그 (미리 등록) */}
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-600">선물 목록 (미리 등록)</p>
            {catalog.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {catalog.map((g) => (
                  <div key={g.giftId} className="flex items-center gap-2 rounded-lg bg-white/60 border border-gray-100 px-2.5 py-1.5">
                    <span className="text-sm">{g.type === 'physical' ? '📦' : '🎁'}</span>
                    <span className="text-xs font-medium text-gray-800 truncate flex-1">{g.name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deleteCatalogMutation.mutate(g.giftId)}
                      className="text-[11px] text-gray-400 hover:text-rose-500"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  value={giftName}
                  onChange={(e) => setGiftName(e.target.value)}
                  maxLength={100}
                  placeholder="선물 이름 (예: 스타벅스 기프티콘)"
                  className="flex-1 text-xs px-2.5 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300"
                />
                <select
                  value={giftType}
                  onChange={(e) => setGiftType(e.target.value as 'digital' | 'physical')}
                  className="text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white"
                >
                  <option value="digital">디지털</option>
                  <option value="physical">실물 배송</option>
                </select>
              </div>
              <div className="flex gap-1.5">
                <input
                  value={giftDesc}
                  onChange={(e) => setGiftDesc(e.target.value)}
                  maxLength={500}
                  placeholder="설명 (선택 — 교환 방법 등)"
                  className="flex-1 text-xs px-2.5 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-300"
                />
                <button
                  type="button"
                  disabled={busy || !giftName.trim()}
                  onClick={() => addCatalogMutation.mutate()}
                  className="px-3 py-2 rounded-lg bg-gray-800 text-white text-xs font-semibold disabled:opacity-50"
                >
                  등록
                </button>
              </div>
            </div>
          </div>

          {/* 완주자 선택 + 일괄 발송 */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600">완주자에게 발송 ({completers.length}명)</p>
            {completers.length === 0 ? (
              <p className="text-xs text-gray-400 mt-1.5">아직 완주자가 없어요. 챌린지 종료 후 이용하세요.</p>
            ) : (
              <>
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {completers.map((p) => {
                    const sent = vouchersByUser.get(String(p.userId)) ?? [];
                    return (
                      <label
                        key={p.userId}
                        className="flex items-center gap-2 rounded-lg bg-white/60 border border-gray-100 px-2.5 py-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(String(p.userId))}
                          onChange={() => toggleUser(String(p.userId))}
                        />
                        <span className="text-xs font-medium text-gray-800">{maskUserId(String(p.userId))}</span>
                        <span className="ml-auto text-[10px] text-gray-400">
                          {sent.length > 0
                            ? sent.map((v) => VOUCHER_STATUS_LABEL[v.status] ?? v.status).join(' · ')
                            : '미발송'}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <select
                    value={selectedGiftId}
                    onChange={(e) => setSelectedGiftId(e.target.value)}
                    className="flex-1 text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white"
                  >
                    <option value="">보낼 선물 선택 (미리 등록에서)</option>
                    {catalog.map((g) => (
                      <option key={g.giftId} value={g.giftId}>
                        {g.type === 'physical' ? '📦' : '🎁'} {g.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !selectedGiftId || selectedUsers.size === 0}
                    onClick={() => {
                      if (window.confirm(`선택한 완주자 ${selectedUsers.size}명에게 선물 교환권을 보낼까요?`)) {
                        sendBatchMutation.mutate();
                      }
                    }}
                    className="px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {sendBatchMutation.isPending ? '발송 중...' : `일괄 발송 (${selectedUsers.size})`}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 발송 현황 + 지급 전 만료일 수정 */}
          {vouchers.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600">발송 현황 ({vouchers.length})</p>
              <div className="mt-1.5 space-y-1">
                {vouchers.slice(0, 15).map((v) => (
                  <div key={v.voucherId} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="truncate">
                      {v.giftName} → {maskUserId(String(v.userId))}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-400 whitespace-nowrap">
                      {VOUCHER_STATUS_LABEL[v.status] ?? v.status}
                    </span>
                    {v.status === 'issued' && (
                      <button
                        type="button"
                        disabled={busy || editExpiryMutation.isPending}
                        onClick={() => {
                          const cur = String(v.expiresAt ?? '').slice(0, 10);
                          const next = window.prompt('만료일 수정 (YYYY-MM-DD)', cur);
                          if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next.trim())) return;
                          editExpiryMutation.mutate({
                            voucherId: v.voucherId,
                            expiresAt: new Date(`${next.trim()}T23:59:59.000Z`).toISOString(),
                          });
                        }}
                        className="text-[10px] text-primary-600 whitespace-nowrap"
                      >
                        만료수정
                      </button>
                    )}
                  </div>
                ))}
                {vouchers.length > 15 && <p className="text-[10px] text-gray-400">+{vouchers.length - 15}건 더</p>}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── 챌린지 해산 (리더) ─────────────────────────────────────────────────────
//  무료: 리더가 즉시 해산(2중 확인). 유료(참가비/보증금/티켓): 운영자에게 사유와 함께 해산 신청.
function DisbandSection({
  challengeId,
  isPaid,
  lifecycle,
}: {
  challengeId: string;
  isPaid: boolean;
  lifecycle?: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');

  const alreadyEnded = lifecycle === 'completed' || lifecycle === 'archived';

  const reset = () => { setOpen(false); setConfirmed(false); setReason(''); };

  const disbandMutation = useMutation({
    mutationFn: () => apiClient.post(`/c/challenges/${challengeId}/disband`),
    onSuccess: () => {
      toast.success('챌린지를 해산했어요. 참여자에게 안내가 전송됩니다.');
      reset();
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      queryClient.invalidateQueries({ queryKey: ['my-challenges-completed', 'all'] });
      queryClient.invalidateQueries({ queryKey: ['my-created-challenges'] });
      navigate('/me');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '해산에 실패했어요'),
  });

  const requestMutation = useMutation({
    mutationFn: () => apiClient.post(`/c/challenges/${challengeId}/disband-request`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success('해산 신청을 접수했어요. 운영자 검토 후 결과를 알려드릴게요.');
      reset();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '신청에 실패했어요'),
  });

  const busy = disbandMutation.isPending || requestMutation.isPending;

  return (
    <section className="glass-card rounded-2xl p-5 border border-rose-100">
      <h3 className="font-bold text-rose-700">🚨 챌린지 해산</h3>
      {alreadyEnded ? (
        <p className="text-sm text-gray-500 mt-2">이미 종료된 챌린지예요.</p>
      ) : isPaid ? (
        <p className="text-[11px] text-gray-500 mt-1">
          유료 챌린지는 리더가 바로 해산할 수 없어요. 사유와 함께 <b>운영자에게 해산을 신청</b>합니다. (환불은 운영자가 별도 처리)
        </p>
      ) : (
        <p className="text-[11px] text-gray-500 mt-1">
          챌린지를 <b>전체 해산</b>합니다. 참여자 전원에게 안내되고 완료 탭으로 이동해요. <b>되돌릴 수 없어요.</b>
        </p>
      )}

      {!alreadyEnded && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-semibold text-sm hover:bg-rose-100 transition-colors"
        >
          {isPaid ? '운영자에게 해산 신청' : '챌린지 해산'}
        </button>
      )}

      {!alreadyEnded && open && (
        <div className="mt-3 space-y-3 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
          {isPaid ? (
            <>
              <label className="text-xs font-semibold text-gray-700">해산 사유 (운영자 전달)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="해산이 필요한 이유를 5자 이상 적어주세요."
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-rose-300 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || reason.trim().length < 5}
                  onClick={() => requestMutation.mutate()}
                  className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {requestMutation.isPending ? '신청 중...' : '해산 신청 보내기'}
                </button>
                <button type="button" onClick={reset} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold">취소</button>
              </div>
            </>
          ) : (
            <>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
                <span className="text-xs text-gray-700">위 내용을 이해했으며, 해산은 <b>되돌릴 수 없음</b>을 확인합니다.</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !confirmed}
                  onClick={() => disbandMutation.mutate()}
                  className="flex-1 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {disbandMutation.isPending ? '해산 중...' : '해산 확정'}
                </button>
                <button type="button" onClick={reset} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold">취소</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function LeaderOpsTab({
  challengeId,
  challengeType = 'leader_personal',
  allowedVerificationTypes,
  personalQuestEnabled,
  isPaid = false,
  lifecycle,
  managerMode = false,
  managerIds = [],
  onManagersChanged,
}: {
  challengeId: string;
  challengeType?: string;
  allowedVerificationTypes?: Array<'image' | 'video' | 'link' | 'text'>;
  personalQuestEnabled?: boolean;
  isPaid?: boolean;
  lifecycle?: string;
  /** 매니저로 접근 — 파괴적 섹션(해산·매니저 관리·라이프사이클 컨트롤·삭제) 숨김 */
  managerMode?: boolean;
  managerIds?: string[];
  onManagersChanged?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {managerMode && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2.5 flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <p className="text-xs font-semibold text-indigo-800">
            매니저 모드 — 운영을 도울 수 있어요. 해산·삭제 등 결정 권한은 리더에게만 있어요.
          </p>
        </div>
      )}
      {/* 1) 오늘 참여 현황 */}
      <BriefingSection challengeId={challengeId} />

      {/* 2) 인증 수정 요청 처리 */}
      <CompletionRequestSection challengeId={challengeId} />

      {/* 3) 참여자 관리 · 리더 DM (참여자별 DM 버튼 포함) */}
      <ParticipantsSection challengeId={challengeId} managerIds={managerIds} />

      {/* 4) 가이드·미션(리더퀘스트) 관리 */}
      <LeaderQuestCreateSection
        challengeId={challengeId}
        challengeType={challengeType}
        allowedVerificationTypes={allowedVerificationTypes}
      />
      <LeaderQuestManageSection
        challengeId={challengeId}
        challengeType={challengeType}
        allowedVerificationTypes={allowedVerificationTypes}
        managerMode={managerMode}
      />
      <ProposalReviewSection
        challengeId={challengeId}
        challengeType={challengeType}
        personalQuestEnabled={personalQuestEnabled}
      />

      {/* 5) 운영 도구 — 게시물 댓글·매니저·티켓·선물 */}
      {!managerMode && <OpsPostsSection challengeId={challengeId} />}
      {!managerMode && (
        <ManagerSection challengeId={challengeId} managerIds={managerIds} onChanged={onManagersChanged} />
      )}
      {isPaid && <TicketSection challengeId={challengeId} />}
      <RewardProductsSection challengeId={challengeId} />
      <GiftSection challengeId={challengeId} />

      {/* 6) 챌린지 설정 및 종료 — 맨 아래 (리더 전용) */}
      {!managerMode && <ChallengeControlCard challengeId={challengeId} />}
      {!managerMode && <DisbandSection challengeId={challengeId} isPaid={isPaid} lifecycle={lifecycle} />}

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
