import { useState } from 'react';
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

// 참여자 일자별 완료 인정 그리드 — 리더가 게시물 없이도 특정 날짜를 완료 인정/취소
function ParticipantDayGrid({ challengeId, participant }: { challengeId: string; participant: LeaderParticipant }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const days = participant.days ?? [];

  const toggleMutation = useMutation({
    mutationFn: ({ day, granted }: { day: number; granted: boolean }) =>
      granted
        ? challengeApi.revokeDayComplete(challengeId, participant.userId, day)
        : challengeApi.grantDayComplete(challengeId, participant.userId, day),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leader-participants', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['leader-briefing', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '처리에 실패했어요'),
  });

  if (days.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-semibold text-gray-500 flex items-center gap-1"
      >
        일자별 완료 인정 {open ? '▲' : '▼'}
      </button>
      {open && (
        <>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const isSuccess = d.status === 'success';
              const busy = toggleMutation.isPending && toggleMutation.variables?.day === d.day;
              const base =
                isSuccess
                  ? 'bg-emerald-500 text-white'
                  : d.status === 'partial'
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-gray-100 text-gray-400';
              return (
                <button
                  key={d.day}
                  type="button"
                  disabled={busy}
                  title={
                    isSuccess
                      ? `${d.day}일차 완료${d.granted ? '(수동인정)' : ''} — 눌러서 취소`
                      : `${d.day}일차 — 눌러서 완료 인정(+1점)`
                  }
                  onClick={() => toggleMutation.mutate({ day: d.day, granted: isSuccess })}
                  className={`relative h-8 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-50 ${base}`}
                >
                  {d.day}
                  {d.granted && (
                    <span className="absolute -top-1 -right-1 text-[8px] leading-none bg-white text-emerald-700 rounded-full w-3 h-3 flex items-center justify-center border border-emerald-300">
                      ✋
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 align-middle" /> 완료 ·
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-200 align-middle ml-1" /> 일부 ·
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-100 align-middle ml-1" /> 미완 · ✋ 수동인정. 칸을 눌러 완료/취소.
          </p>
        </>
      )}
    </div>
  );
}

function ParticipantsSection({ challengeId }: { challengeId: string }) {
  const navigate = useNavigate();
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
                  <button
                    type="button"
                    onClick={() => navigate(`/dm/${challengeId}/${p.userId}`)}
                    className="ml-auto rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    💬 DM
                  </button>
                </div>
                <ParticipantDayGrid challengeId={challengeId} participant={p} />
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
}: {
  challengeId: string;
  challengeType: string;
  allowedVerificationTypes?: Array<'image' | 'video' | 'link' | 'text'>;
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
}: {
  challengeId: string;
  quest: any;
  allowedVerificationTypes?: Array<'image' | 'video' | 'link' | 'text'>;
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

export function LeaderOpsTab({
  challengeId,
  challengeType = 'leader_personal',
  allowedVerificationTypes,
  personalQuestEnabled,
}: {
  challengeId: string;
  challengeType?: string;
  allowedVerificationTypes?: Array<'image' | 'video' | 'link' | 'text'>;
  personalQuestEnabled?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <ChallengeControlCard challengeId={challengeId} />
      <BriefingSection challengeId={challengeId} />
      <LeaderQuestCreateSection
        challengeId={challengeId}
        challengeType={challengeType}
        allowedVerificationTypes={allowedVerificationTypes}
      />
      <LeaderQuestManageSection
        challengeId={challengeId}
        challengeType={challengeType}
        allowedVerificationTypes={allowedVerificationTypes}
      />
      <ParticipantsSection challengeId={challengeId} />
      <ProposalReviewSection
        challengeId={challengeId}
        challengeType={challengeType}
        personalQuestEnabled={personalQuestEnabled}
      />
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
