import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { challengeApi, CreatedChallenge, ChallengeLifecycle } from '@/features/challenge/api/challengeApi';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { InlineVerificationForm } from '@/features/verification/components/InlineVerificationForm';
import { getChallengeTypeLabel as getChallengeTypeLabelByType } from '@/features/challenge/utils/flowPolicy';
import {
  getChallengeDisplayMeta,
  getLatestCompletedProgressEntry,
  getProgressEntryByDay,
  isChallengePeriodCompleted,
  isFailedChallengeState,
  resolveChallengeBucket,
  resolveChallengeDurationDays,
  resolveVerificationStatusForDay,
} from '@/features/challenge/utils/challengeLifecycle';
import toast from 'react-hot-toast';

type METab = 'active' | 'pending' | 'completed';


function getChallengeTypeLabel(challenge: any) {
  const type = String(challenge?.challenge?.challengeType || challenge?.challenge?.type || 'leader_personal');
  return getChallengeTypeLabelByType(type);
}

// personalTarget → 분 단위 변환 (0~1439)
function getPersonalTargetMinutes(challenge: any): number {
  const target = challenge.personalTarget;
  if (!target) return 12 * 60; // 기본 정오
  let hour = Number(target.hour12 || 12);
  const minute = Number(target.minute || 0);
  const meridiem = String(target.meridiem || 'AM').toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getMinutesUntilTarget(challenge: any): number {
  const nowMinutes = getCurrentMinutes();
  const targetMinutes = getPersonalTargetMinutes(challenge);
  return (targetMinutes - nowMinutes + 24 * 60) % (24 * 60);
}

// ISO 타임스탬프가 KST 기준으로 오늘인지 확인
function isSameKstDate(iso: string | undefined | null): boolean {
  if (!iso) return false;
  const todayKst = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' });
  const targetKst = new Date(iso).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' });
  return todayKst === targetKst;
}

// Asia/Seoul 기준 오늘 날짜를 로컬 Date(자정)로 반환
function getTodayInSeoul(): Date {
  const seoulStr = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' }); // "YYYY-MM-DD"
  const [y, m, d] = seoulStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseChallengeStartDate(challenge: any): Date | null {
  const start =
    challenge?.challenge?.actualStartAt ||
    challenge?.challenge?.startConfirmedAt ||
    challenge?.startDate ||
    challenge?.challenge?.startDate ||
    challenge?.challenge?.challengeStartAt;
  if (!start || typeof start !== 'string') return null;

  // ISO 타임스탬프는 Asia/Seoul 기준 날짜로 변환, date-only 문자열은 그대로 파싱
  let dateStr: string;
  if (start.includes('T') || start.includes('Z')) {
    dateStr = new Date(start).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' });
  } else {
    dateStr = start.slice(0, 10);
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function getChallengeDay(challenge: any): number {
  const durationDays = resolveChallengeDurationDays(challenge);
  const maxDay = durationDays + 1;
  const storedCurrentDay = Math.max(1, Math.min(maxDay, Number(challenge.currentDay || 1)));

  const canSyncElapsedDay = isChallengeActivelyRunning(challenge);

  if (!canSyncElapsedDay) return storedCurrentDay;

  const startDate = parseChallengeStartDate(challenge);
  if (!startDate) return storedCurrentDay;

  const today = getTodayInSeoul();
  const diffMs = today.getTime() - startDate.getTime();
  const elapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  const syncedCurrentDay = Math.max(1, Math.min(maxDay, elapsed));

  return Math.max(storedCurrentDay, syncedCurrentDay);
}

function isChallengeActivelyRunning(challenge: any): boolean {
  const lifecycle = String(challenge?.challenge?.lifecycle || '').toLowerCase();
  const phase = String(challenge?.phase || '').toLowerCase();
  const status = String(challenge?.status || '').toLowerCase();

  const isActiveLifecycle = lifecycle === 'active';
  const isActivePhase = phase === 'active' || phase === 'in_progress';
  const isActiveStatus = status === '' || status === 'active' || status === 'in_progress';

  return (isActiveLifecycle || isActivePhase) && isActiveStatus;
}


function formatPersonalTarget(challenge: any): string {
  const target = challenge.personalTarget;
  if (!target) return '';
  const hour = String(target.hour12 || 12).padStart(2, '0');
  const minute = String(target.minute || 0).padStart(2, '0');
  const meridiem = target.meridiem === 'PM' ? '오후' : '오전';
  return `${meridiem} ${hour}:${minute}`;
}

function formatVerificationTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes();
  const mer = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${mer} ${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Returns the CALENDAR-based day (elapsed since startDate), ignoring storedCurrentDay.
// After a verification, the backend increments storedCurrentDay to day+1,
// causing getChallengeDay() to return day+1 (via Math.max). We need the actual
// calendar day to correctly detect today's completed verification.
function getCalendarChallengeDay(challenge: any): number {
  const isActive = isChallengeActivelyRunning(challenge);

  const startDate = parseChallengeStartDate(challenge);
  if (!isActive || !startDate) return getChallengeDay(challenge);

  const durationDays = resolveChallengeDurationDays(challenge);
  const today = getTodayInSeoul();
  const diffMs = today.getTime() - startDate.getTime();
  const elapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, Math.min(durationDays, elapsed));
}

function isTodayVerified(challenge: any): boolean {
  const progress = Array.isArray(challenge?.progress) ? challenge.progress : [];
  const verifiedStatuses = new Set(['success', 'partial', 'completed', 'remedy', 'failed']);

  // Primary: check timestamp field on progress entries (always set by submit Lambda)
  // This avoids reliance on calendarDay calculation which fails when startDate is missing.
  const todayKst = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' });
  for (const entry of progress) {
    const s = String(entry?.status || '').toLowerCase();
    if (!verifiedStatuses.has(s)) continue;
    if (!entry?.timestamp) continue;
    const entryKst = new Date(entry.timestamp).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' });
    if (entryKst === todayKst) return true;
  }

  // Fallback: calendar day based check (when timestamp is absent)
  const calendarDay = getCalendarChallengeDay(challenge);
  const target = getProgressEntryByDay(progress, calendarDay);
  const status = String(target?.status || '').toLowerCase();
  return verifiedStatuses.has(status);
}

const getProposalStatusMeta = (status?: string) => {
  const key = String(status || 'pending');
  if (key === 'approved') return { label: '승인됨', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', nextAction: '승인 완료. 활성 단계에서 인증을 진행하세요.' };
  if (key === 'rejected') return { label: '수정 필요', color: 'text-rose-700 bg-rose-50 border-rose-200', nextAction: '리더 피드백 반영 후 /quests 페이지에서 수정 재제출이 필요합니다.' };
  if (key === 'revision_pending') return { label: '재심사 대기', color: 'text-indigo-700 bg-indigo-50 border-indigo-200', nextAction: '리더가 수정본을 검토 중입니다. 결과를 기다려주세요.' };
  if (key === 'expired') return { label: '기간 만료', color: 'text-gray-700 bg-gray-100 border-gray-200', nextAction: '제안 마감이 지나 개인 퀘스트 없이 진행됩니다.' };
  if (key === 'disqualified') return { label: '자격 제한', color: 'text-gray-700 bg-gray-200 border-gray-300', nextAction: '개인 퀘스트 제안 자격이 제한되었습니다.' };
  return { label: '검토중', color: 'text-amber-700 bg-amber-50 border-amber-200', nextAction: '리더 검토 결과를 기다려주세요.' };
};

// ─── lifecycle 메타 ───────────────────────────────────────────────────
const LIFECYCLE_META: Record<ChallengeLifecycle, { icon: string; label: string }> = {
  draft:      { icon: '🔒', label: '준비 중' },
  recruiting: { icon: '📣', label: '모집 중' },
  preparing:  { icon: '⏳', label: '준비 기간' },
  active:     { icon: '🏃', label: '진행 중' },
  completed:  { icon: '✅', label: '완료' },
  archived:   { icon: '📦', label: '보관' },
};

// ─── 내가 만든 챌린지 섹션 ────────────────────────────────────────────
function MyCreatedChallengesSection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: myCreated, isLoading } = useQuery({
    queryKey: ['my-created-challenges'],
    queryFn: challengeApi.getMyCreated,
  });

  const publishMutation = useMutation({
    mutationFn: (challengeId: string) => challengeApi.publishChallenge(challengeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-created-challenges'] });
      toast.success('모집이 시작됐어요!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? '공개에 실패했어요');
    },
  });

  if (isLoading || !myCreated || myCreated.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-gray-700">내가 만든 챌린지</h2>
        <button
          onClick={() => navigate('/challenges/new')}
          className="text-xs text-primary-600 font-semibold hover:text-primary-700"
        >
          + 새 챌린지
        </button>
      </div>
      {myCreated.map((c: CreatedChallenge) => {
        const meta = LIFECYCLE_META[c.lifecycle] ?? { icon: '•', label: c.lifecycle };
        const canPublish = c.lifecycle === 'draft';
        const canReviewJoins = ['recruiting', 'preparing'].includes(c.lifecycle) && (c.stats.pendingParticipants ?? 0) > 0;
        const canViewBoard = ['recruiting', 'preparing', 'active', 'completed'].includes(c.lifecycle);

        return (
          <div key={c.challengeId} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{c.badgeIcon || '🏆'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{c.title}</p>
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium mt-0.5 ${
                  c.lifecycle === 'draft' ? 'text-gray-500' :
                  c.lifecycle === 'recruiting' ? 'text-blue-600' :
                  c.lifecycle === 'active' ? 'text-green-600' :
                  'text-gray-500'
                }`}>
                  {meta.icon} {meta.label} · 참여자 {c.stats.totalParticipants}명
                </span>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {canPublish && (
                <button
                  onClick={() => publishMutation.mutate(c.challengeId)}
                  disabled={publishMutation.isPending}
                  className="px-3 py-1.5 text-xs font-semibold rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {publishMutation.isPending ? '공개 중...' : '모집 시작하기'}
                </button>
              )}
              {canReviewJoins && (
                <button
                  onClick={() => navigate(`/challenges/${c.challengeId}/join-requests`)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-full border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                >
                  참여자 심사 ({c.stats.pendingParticipants}명)
                </button>
              )}
              {canViewBoard && (
                <button
                  onClick={() => navigate(`/challenge-board/${c.challengeId}`)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-full border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                >
                  게시판
                </button>
              )}
              <button
                onClick={() => navigate(`/challenges/${c.challengeId}`)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 transition-colors"
              >
                상세 보기
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export const MEPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<METab>('active');

  const { data, isLoading } = useQuery({
    queryKey: ['my-challenges'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=active');
      return response.data.data;
    },
    refetchInterval: 60 * 1000,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const challenges = data?.challenges || [];

  const { data: completedChallengesData } = useQuery({
    queryKey: ['my-challenges-completed', 'all'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=all');
      return response.data.data;
    },
    refetchInterval: 60 * 1000,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const { data: extraCountData } = useQuery({
    queryKey: ['verifications', 'mine-extra-count'],
    queryFn: async () => {
      const response = await apiClient.get('/verifications?mine=true&isExtra=true&limit=5');
      return response.data.data;
    },
    refetchInterval: 60 * 1000,
  });

  const { data: myVerificationsData } = useQuery({
    queryKey: ['verifications', 'mine-all'],
    queryFn: async () => {
      const response = await apiClient.get('/verifications?mine=true&isExtra=false&limit=50');
      return response.data.data;
    },
    refetchInterval: 60 * 1000,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // (challengeId|userChallengeId) + day → verification (non-extra)
  // progress GSI 지연 보완: progress 엔트리가 없을 때 verifications 테이블로 fallback
  // userChallengeId를 우선 키로 사용 (challengeId 누락 케이스 대응)
  const verifiedDaysByUCIdMap = useMemo(() => {
    const map = new Map<string, Map<number, any>>();
    const items: any[] = myVerificationsData?.verifications || [];
    for (const v of items) {
      if (!v.userChallengeId || v.isExtra) continue;
      const day = Number(v.day);
      if (!Number.isFinite(day) || day < 1) continue;
      if (!map.has(v.userChallengeId)) map.set(v.userChallengeId, new Map());
      const dayMap = map.get(v.userChallengeId)!;
      if (!dayMap.has(day)) dayMap.set(day, v);
    }
    return map;
  }, [myVerificationsData]);

  const verifiedDaysByChallengeMap = useMemo(() => {
    const map = new Map<string, Map<number, any>>();
    const items: any[] = myVerificationsData?.verifications || [];
    for (const v of items) {
      if (!v.challengeId || v.isExtra) continue;
      const day = Number(v.day);
      if (!Number.isFinite(day) || day < 1) continue;
      if (!map.has(v.challengeId)) map.set(v.challengeId, new Map());
      const dayMap = map.get(v.challengeId)!;
      if (!dayMap.has(day)) dayMap.set(day, v);
    }
    return map;
  }, [myVerificationsData]);

  // verifications 테이블 기반으로 오늘 1차 인증(non-extra)한 challengeId 세트
  // progress 배열 스탈 데이터(GSI 지연, 혼합형 partial 쓰기 실패) 보완용
  const todayVerifiedChallengeIds = useMemo(() => {
    const set = new Set<string>();
    const items: any[] = myVerificationsData?.verifications || [];
    for (const v of items) {
      if (v.challengeId && !v.isExtra && isSameKstDate(v.performedAt || v.createdAt)) {
        set.add(v.challengeId);
      }
    }
    return set;
  }, [myVerificationsData]);

  const personalQuestTargetChallenges = useMemo(
    () => challenges.filter((challenge: any) => Boolean(challenge?.challenge?.personalQuestEnabled)),
    [challenges],
  );

  const { data: personalQuestProposalMap } = useQuery({
    queryKey: ['my-personal-quest-proposals', personalQuestTargetChallenges.map((c: any) => c.challengeId).join(',')],
    enabled: personalQuestTargetChallenges.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        personalQuestTargetChallenges.map(async (challenge: any) => {
          const response = await apiClient.get(`/challenges/${challenge.challengeId}/personal-quest`);
          return [challenge.challengeId, response.data?.data?.latestProposal || null] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, any>;
    },
    refetchInterval: 60 * 1000,
  });

  const [leaderDmTargetId, setLeaderDmTargetId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const leaderDmMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      setLeaderDmTargetId(challengeId);
      const response = await apiClient.post(`/challenge-feed/${challengeId}/leader-dm`);
      return response.data;
    },
    onSuccess: async (res: any) => {
      const threadId = res?.threadId || res?.data?.threadId;
      const deepLink = res?.deepLink || res?.data?.deepLink;
      const isNew = res?.isNew ?? res?.data?.isNew;
      const message = isNew ? '리더 DM 대화가 열렸어요 ✉️' : '기존 리더 DM 대화로 연결했어요 ✉️';
      if (threadId && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(threadId));
      }
      if (typeof deepLink === 'string' && deepLink.startsWith('/messages/')) {
        toast.success(message);
        navigate(deepLink);
        return;
      }
      toast.success(threadId ? `${message} (threadId 복사됨)` : message);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '리더 DM 연결에 실패했습니다');
    },
    onSettled: () => {
      setLeaderDmTargetId(null);
    },
  });

  const handleVerifiedCardClick = (challenge: any) => {
    const id = challenge.userChallengeId;
    const challengeId = challenge.challengeId || challenge.challenge?.challengeId;
    if (expandedCards.has(id)) {
      navigate(`/challenge-feed/${challengeId}`);
    } else {
      setExpandedCards((prev) => { const next = new Set(prev); next.add(id); return next; });
    }
  };

  const handleLeaderDm = (challenge: any) => {
    const challengeId = challenge?.challengeId || challenge?.challenge?.challengeId;
    if (!challengeId) {
      toast.error('챌린지 정보를 찾지 못했습니다');
      return;
    }
    leaderDmMutation.mutate(challengeId);
  };

  const pendingChallenges = useMemo(
    () => (completedChallengesData?.challenges || []).filter((challenge: any) => resolveChallengeBucket(challenge) === 'preparing'),
    [completedChallengesData],
  );

  const activeChallenges = useMemo(
    () => challenges.filter((challenge: any) => resolveChallengeBucket(challenge) === 'active'),
    [challenges],
  );

  const completedChallenges = useMemo(
    () => (completedChallengesData?.challenges || []).filter((challenge: any) => {
      const bucket = resolveChallengeBucket(challenge);
      return bucket === 'completed' || bucket === 'gave_up';
    }),
    [completedChallengesData],
  );

  // progress 배열 + verifications 테이블 이중 확인으로 오늘 인증 여부 판단
  // (혼합형 partial 쓰기 실패 또는 GSI 일관성 지연 시에도 정확하게 동작)
  const isVerifiedToday = (c: any) =>
    isTodayVerified(c) || todayVerifiedChallengeIds.has(c.challengeId);

  // 미인증 챌린지: personalTarget 시간 기준으로 현재와 가장 가까운 순 정렬
  const unverifiedChallenges = useMemo(
    () => activeChallenges
      .filter((c: any) => !isVerifiedToday(c) && getChallengeDay(c) <= resolveChallengeDurationDays(c))
      .sort((a: any, b: any) => {
        const minuteDiff = getMinutesUntilTarget(a) - getMinutesUntilTarget(b);
        if (minuteDiff !== 0) return minuteDiff;

        // 동일 목표 시간대라면 더 많이 진행된 챌린지 Day를 우선 노출
        const dayDiff = getChallengeDay(b) - getChallengeDay(a);
        if (dayDiff !== 0) return dayDiff;

        return String(a.userChallengeId || '').localeCompare(String(b.userChallengeId || ''));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeChallenges, todayVerifiedChallengeIds],
  );

  // 오늘 인증 완료 챌린지
  const verifiedTodayChallenges = useMemo(
    () => activeChallenges.filter((c: any) => isVerifiedToday(c) || isChallengePeriodCompleted(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeChallenges, todayVerifiedChallengeIds],
  );

  const TAB_CONFIG: { key: METab; label: string; count: number }[] = [
    { key: 'active', label: '진행중', count: activeChallenges.length },
    { key: 'pending', label: '준비중', count: pendingChallenges.length },
    { key: 'completed', label: '완료', count: completedChallenges.length },
  ];

  const isEmpty = activeChallenges.length === 0 && pendingChallenges.length === 0 && completedChallenges.length === 0;

  // 섹션1: 오늘 기준 목표 시간이 가장 가까운 미인증 챌린지 → InlineVerificationForm
  const primaryUnverified = unverifiedChallenges[0] ?? null;
  // 섹션2: 전체 미인증 챌린지 (섹션1과 동일 항목 포함)
  const otherUnverified = unverifiedChallenges;

  // 섹션1 완료 배너용: 내일 목표시간 가장 빠른 챌린지
  const earliestTargetChallenge = useMemo(() => {
    const withTarget = activeChallenges.filter((c: any) => c.personalTarget);
    if (withTarget.length === 0) return null;
    return withTarget.reduce((prev: any, curr: any) =>
      getPersonalTargetMinutes(curr) < getPersonalTargetMinutes(prev) ? curr : prev
    );
  }, [activeChallenges]);


  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 pt-12 pb-8 px-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-white/80 text-sm">안녕하세요!</p>
            <h1 className="text-white font-bold text-2xl">{user?.name || '챌린저'}님 👋</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/personal-feed/notifications')}
              className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-lg"
              aria-label="알림"
            >
              🔔
            </button>
            <button
              onClick={() => navigate('/personal-feed/me')}
              className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl"
            >
              {user?.animalIcon || '🐰'}
            </button>
          </div>
        </div>
      </div>

      {/* 내가 만든 챌린지 (데스크탑 사이드바) */}
      <div className="hidden lg:block px-6 pt-4">
        <MyCreatedChallengesSection />
      </div>

      {/* 챌린지 목록 */}
      <div className="p-6 space-y-4">
        {isLoading ? (
          <Loading />
        ) : isEmpty ? (
          <EmptyState
            icon="🎯"
            title="진행 중인 챌린지가 없어요"
            description="새로운 챌린지에 참여하고 여정을 시작해보세요!"
            action={{
              label: '챌린지 참여하기',
              onClick: () => navigate('/challenges'),
            }}
          />
        ) : (
          <>
            {/* 탭 */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`ml-1 text-xs ${activeTab === tab.key ? 'text-primary-600' : 'text-gray-400'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* 진행중 탭 */}
            {activeTab === 'active' && (
              <div className="space-y-4">
                {activeChallenges.length === 0 ? (
                  <EmptyState icon="🏃" title="진행 중인 챌린지가 없어요" description="챌린지에 참여하고 오늘부터 시작해보세요" />
                ) : (
                  <>
                    {/* 섹션 1: 오늘 인증 or 모두 완료 배너 */}
                    {primaryUnverified ? (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl p-4 shadow-sm border border-primary-100"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-100 px-2 py-0.5 rounded-full">
                              📌 지금 인증하기
                            </span>
                            <span className="text-xs text-gray-500">
                              {getChallengeTypeLabel(primaryUnverified)}
                            </span>
                          </div>
                          {primaryUnverified.personalTarget && (
                            <span className="text-xs text-gray-400">
                              목표 {formatPersonalTarget(primaryUnverified)}
                            </span>
                          )}
                        </div>
                        <InlineVerificationForm
                          userChallenge={primaryUnverified}
                          allowedVerificationTypes={primaryUnverified.challenge?.allowedVerificationTypes}
                          onSuccess={() => {
                            void queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
                            void queryClient.invalidateQueries({ queryKey: ['my-challenges-completed', 'all'] });
                            void queryClient.invalidateQueries({ queryKey: ['verifications', 'mine-all'] });
                          }}
                        />
                      </motion.div>
                    ) : unverifiedChallenges.length === 0 && verifiedTodayChallenges.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-emerald-50 rounded-2xl px-5 py-4 border border-emerald-100 shadow-sm"
                      >
                        <p className="font-bold text-emerald-800 text-sm">🎉 오늘 모든 인증 완료!</p>
                        {earliestTargetChallenge && (
                          <p className="text-xs text-emerald-700 mt-1">
                            내일 목표 시간: {formatPersonalTarget(earliestTargetChallenge)}
                          </p>
                        )}
                      </motion.div>
                    )}

                    {/* 섹션 2: 다른 미인증 챌린지 */}
                    {otherUnverified.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">오늘 인증 예정</p>
                        {otherUnverified.map((challenge: any, index: number) => {
                          const { durationDays, participatedDays, completionRate } = getChallengeDisplayMeta(challenge);
                          const challengeDay = getCalendarChallengeDay(challenge);
                          return (
                          <motion.div
                            key={challenge.userChallengeId}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 flex items-center gap-3"
                          >
                            <span className="text-2xl flex-shrink-0">{challenge.challenge?.badgeIcon || '🎯'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate">{challenge.challenge?.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-primary-600">Day {challengeDay} / {durationDays}</span>
                                <span className="text-xs text-gray-400">참여 {participatedDays}일 · 진행률 {completionRate}%</span>
                                {challenge.personalTarget && (
                                  <span className="text-xs text-gray-400">목표 {formatPersonalTarget(challenge)}</span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate(`/challenge-feed/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                              className="flex-shrink-0 px-3 py-2 bg-primary-500 text-white text-xs font-semibold rounded-xl hover:bg-primary-600 transition-colors"
                            >
                              인증하기
                            </button>
                          </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {/* 섹션 3: 인증 완료 챌린지 */}
                    {verifiedTodayChallenges.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">인증 완료</p>
                        {verifiedTodayChallenges.map((challenge: any, index: number) => {
                          const progress = challenge.progress || [];
                          const { durationDays } = getChallengeDisplayMeta(challenge);
                          const challengeDay = getCalendarChallengeDay(challenge);
                          const uid = challenge.userChallengeId;
                          const isExpanded = expandedCards.has(uid);

                          // 가장 최근 인증된 날 (접힌 상태에서 표시할 행)
                          const lastVerified = getLatestCompletedProgressEntry(progress);
                          // progress GSI 지연 보완: progress 없을 때 verifications 테이블로 fallback
                          const fallbackLastVerifiedEntry = (() => {
                            if (lastVerified) return null;
                            // userChallengeId 우선, challengeId fallback
                            const dayMap =
                              verifiedDaysByUCIdMap.get(challenge.userChallengeId) ||
                              verifiedDaysByChallengeMap.get(challenge.challengeId);
                            if (!dayMap || dayMap.size === 0) return null;
                            let latestDay = 0;
                            let latestVerif: any = null;
                            dayMap.forEach((v, d) => { if (d > latestDay) { latestDay = d; latestVerif = v; } });
                            if (!latestVerif) return null;
                            return { day: latestDay, entry: { day: latestDay, status: 'success', timestamp: latestVerif.performedAt || latestVerif.createdAt, verificationId: latestVerif.verificationId } };
                          })();

                          return (
                            <motion.div
                              key={uid}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                              onClick={() => handleVerifiedCardClick(challenge)}
                              className={`bg-white rounded-2xl p-4 shadow-sm border cursor-pointer transition-colors ${
                                isExpanded ? 'border-primary-200 active:bg-primary-50' : 'border-gray-100 hover:border-primary-200 active:bg-gray-50'
                              }`}
                            >
                              {/* 헤더: 배지 + 제목 + 점수 + 펼침 표시 */}
                              <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl flex-shrink-0">{challenge.challenge?.badgeIcon || '🎯'}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-900 text-sm truncate">{challenge.challenge?.title}</p>
                                  <p className="text-xs text-green-600 mt-0.5">✅ 인증 완료 · Day {challengeDay} / {durationDays}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-xl font-bold text-gray-800">{challenge.score || 0}</span>
                                  <span className="text-xs text-gray-400">점</span>
                                  <span className="ml-1 text-xs text-gray-300">{isExpanded ? '▲' : '▼'}</span>
                                </div>
                              </div>

                              {/* 접힌 상태: 최근 인증 날 행 1줄 */}
                              {!isExpanded && (lastVerified || fallbackLastVerifiedEntry) && (() => {
                                const src = lastVerified || fallbackLastVerifiedEntry!;
                                const p = src.entry;
                                const timeStr = formatVerificationTime(p.timestamp);
                                const isSuccessEntry = p.status === 'success';
                                return (
                                  <div className="flex items-center gap-2.5 pt-1">
                                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isSuccessEntry ? 'bg-green-500' : 'bg-gray-200'}`} />
                                    <p className="text-xs truncate flex-1 min-w-0">
                                      <span className={`font-semibold ${isSuccessEntry ? 'text-gray-700' : 'text-gray-400'}`}>{src.day}일차</span>
                                      {isSuccessEntry && timeStr && <span className="text-gray-400"> · {timeStr}</span>}
                                    </p>
                                  </div>
                                );
                              })()}

                              {/* 펼친 상태: Day 1~N 세로 타임라인 */}
                              {isExpanded && (
                                <div className="pt-1">
                                  <p className="text-xs text-primary-500 text-right mb-2">탭하면 피드로 이동 →</p>
                                  {Array.from({ length: durationDays }, (_, i) => {
                                    const day = i + 1;
                                    let p = getProgressEntryByDay(progress, day);
                                    let status = resolveVerificationStatusForDay(progress, day, challengeDay);
                                    // progress GSI 지연 보완: 엔트리 없을 때 verifications 테이블 fallback
                                    // userChallengeId 우선, challengeId fallback
                                    if (!p && (status === 'pending' || status === 'skipped')) {
                                      const fbVerif =
                                        verifiedDaysByUCIdMap.get(challenge.userChallengeId)?.get(day) ||
                                        verifiedDaysByChallengeMap.get(challenge.challengeId)?.get(day);
                                      if (fbVerif) {
                                        status = 'success';
                                        p = { day, status: 'success', timestamp: fbVerif.performedAt || fbVerif.createdAt, verificationId: fbVerif.verificationId };
                                      }
                                    }
                                    const isSuccess = status === 'success';
                                    const timeStr = isSuccess ? formatVerificationTime(p?.timestamp) : null;
                                    const isLastItem = i === durationDays - 1;
                                    return (
                                      <div key={day} className="flex items-start gap-3">
                                        {/* 왼쪽: 점 + 세로선 */}
                                        <div className="flex flex-col items-center flex-shrink-0" style={{ width: 16 }}>
                                          <div className={`w-2.5 h-2.5 rounded-full mt-1 ${isSuccess ? 'bg-green-500' : 'bg-gray-200'}`} />
                                          {!isLastItem && (
                                            <div className={`mt-0.5 flex-1 min-h-[22px] ${isSuccess ? 'w-px bg-gray-200' : 'border-l border-dashed border-gray-200'}`} />
                                          )}
                                        </div>
                                        {/* 오른쪽: 텍스트 */}
                                        <div className="flex-1 min-w-0 pb-2.5">
                                          {isSuccess ? (
                                            <p className="text-xs text-gray-500 truncate mt-0.5">
                                              <span className="font-semibold text-gray-700">{day}일차</span>
                                              {timeStr && <span className="text-gray-400"> · {timeStr}</span>}
                                            </p>
                                          ) : (
                                            <p className="text-xs text-gray-300 mt-0.5">{day}일차</p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {/* 섹션 4: 추가 인증 */}
                    {(extraCountData?.verifications?.length > 0 || extraCountData?.nextToken) && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">추가 인증</p>
                          {(extraCountData?.nextToken || extraCountData?.verifications?.length >= 5) && (
                            <button
                              type="button"
                              onClick={() => navigate('/me/records')}
                              className="text-xs text-primary-500 font-medium"
                            >
                              더보기 →
                            </button>
                          )}
                        </div>
                        {(extraCountData?.verifications || []).map((item: any, index: number) => (
                          <motion.div
                            key={item.verificationId}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 flex items-center gap-3"
                          >
                            <span className="text-2xl flex-shrink-0">📝</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm">Day {item.day} · 추가 기록</p>
                              {item.todayNote && (
                                <p className="text-xs text-gray-400 truncate mt-0.5">{item.todayNote}</p>
                              )}
                            </div>
                            {item.isPersonalOnly ? (
                              <span className="flex-shrink-0 px-2 py-1 text-xs rounded-lg bg-gray-100 text-gray-500 border border-gray-200">나만보기</span>
                            ) : (
                              <span className="flex-shrink-0 px-2 py-1 text-xs rounded-lg bg-green-50 text-green-700 border border-green-200">공개</span>
                            )}
                          </motion.div>
                        ))}
                        {extraCountData?.nextToken && (
                          <button
                            type="button"
                            onClick={() => navigate('/me/records')}
                            className="w-full py-2.5 border border-gray-200 rounded-2xl text-xs text-gray-500 bg-white hover:border-primary-300 hover:text-primary-600 transition-colors"
                          >
                            추가 인증 기록 모두 보기 →
                          </button>
                        )}
                      </div>
                    )}

                    {/* 모두 인증 완료 상태 */}
                    {unverifiedChallenges.length === 0 && verifiedTodayChallenges.length === 0 && (
                      <EmptyState icon="🏃" title="진행 중인 챌린지가 없어요" description="챌린지에 참여하고 오늘부터 시작해보세요" />
                    )}
                  </>
                )}
              </div>
            )}

            {/* 준비중 탭 */}
            {activeTab === 'pending' && (
              <div className="space-y-3">
                {pendingChallenges.length === 0 ? (
                  <EmptyState icon="⏳" title="준비 중인 챌린지가 없어요" description="모집중 챌린지에 참여 신청해보세요" />
                ) : pendingChallenges.map((challenge: any) => {
                  const lifecycle = String(challenge.challenge?.lifecycle || 'preparing');
                  const statusLabel = lifecycle === 'recruiting' ? '리크루팅' : '준비중';
                  const proposal = personalQuestProposalMap?.[challenge.challengeId];
                  const statusMeta = getProposalStatusMeta(proposal?.status);

                  return (
                    <div key={challenge.userChallengeId} className="bg-white rounded-2xl p-5 border border-amber-200 space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{challenge.challenge?.badgeIcon || '🎯'}</span>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{challenge.challenge?.title}</p>
                          <p className="text-xs text-amber-700 mt-0.5">
                            시작일: {challenge.startDate || '-'} · {statusLabel}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate(`/challenge-feed/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                        className="w-full py-2.5 rounded-xl border border-primary-200 text-primary-700 bg-primary-50 text-sm font-medium hover:bg-primary-100 transition-colors"
                      >
                        챌린지 피드 →
                      </button>

                      {challenge.challenge?.personalQuestEnabled && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                          <p className={`inline-flex px-2 py-0.5 text-[11px] rounded-full border ${statusMeta.color}`}>
                            개인 퀘스트: {statusMeta.label}
                          </p>
                          <p className="text-xs text-gray-700">{proposal?.title || '아직 제출한 개인 퀘스트가 없습니다.'}</p>
                          <p className="text-xs text-gray-600">{statusMeta.nextAction}</p>
                          {proposal?.leaderFeedback && (
                            <p className="text-xs text-rose-700">피드백: {proposal.leaderFeedback}</p>
                          )}
                          {proposal?.status === 'rejected' && (
                            <button
                              type="button"
                              onClick={() => navigate(`/quests?challengeId=${challenge.challengeId}`)}
                              className="mt-1 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white"
                            >
                              퀘스트 보드에서 수정하기
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/challenges/${challenge.challengeId}`)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-white border border-amber-200 text-amber-800"
                        >
                          챌린지 소개
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/quests?challengeId=${challenge.challengeId}`)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white"
                        >
                          퀘스트 보드
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLeaderDm(challenge)}
                          disabled={leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-blue-200 bg-white text-blue-700 disabled:opacity-50"
                        >
                          {leaderDmTargetId === (challenge.challengeId || challenge.challenge?.challengeId) ? 'DM 중...' : '리더 DM'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 완료 탭 */}
            {activeTab === 'completed' && (
              <div className="space-y-3">
                {completedChallenges.length === 0 ? (
                  <EmptyState icon="🏆" title="완료한 챌린지가 없어요" description="챌린지를 완주하거나 중도 포기하면 여기에 표시돼요" />
                ) : completedChallenges.map((challenge: any) => {
                  const bucket = resolveChallengeBucket(challenge);
                  const isGaveUp = bucket === 'gave_up';
                  const borderColor = isGaveUp ? 'border-gray-200' : isFailedChallengeState(challenge) ? 'border-gray-300' : 'border-emerald-200';
                  return (
                    <div
                      key={challenge.userChallengeId || challenge.challengeId}
                      className={`bg-white rounded-2xl p-5 border space-y-3 ${borderColor}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{challenge.challenge?.badgeIcon || challenge.badgeIcon || '🏆'}</span>
                        <div>
                          <p className="font-semibold text-gray-900">{challenge.challenge?.title || challenge.title}</p>
                          {isGaveUp ? (
                            <p className="text-xs text-gray-500 mt-0.5">중도 포기 🏳️</p>
                          ) : isFailedChallengeState(challenge) ? (
                            <p className="text-xs text-gray-600 mt-0.5">종료(미달성)</p>
                          ) : (
                            <p className="text-xs text-emerald-700 mt-0.5">완주 완료 🎉</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/challenge-feed/${challenge.challengeId || challenge.challenge?.challengeId}`)}
                        className="w-full py-2.5 rounded-xl border border-primary-200 text-primary-700 bg-primary-50 text-sm font-medium hover:bg-primary-100 transition-colors"
                      >
                        챌린지 피드 →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 추가기록 링크 (active 탭 외에서도 접근 가능하도록) */}
        {activeTab !== 'active' && (extraCountData?.verifications?.length > 0 || extraCountData?.nextToken) && (
          <button
            type="button"
            onClick={() => navigate('/me/records')}
            className="w-full py-3 border border-gray-200 rounded-2xl text-sm text-gray-600 bg-white flex items-center justify-between px-5 hover:border-primary-300 hover:text-primary-600 transition-colors"
          >
            <span>📝 추가기록</span>
            <span className="text-xs text-gray-400">더보기 →</span>
          </button>
        )}

        {/* 실행 가이드 */}
        <section className="bg-white rounded-2xl p-5 border border-gray-200 space-y-3">
          <h2 className="text-lg font-bold text-gray-900">실행 가이드</h2>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• 기본 인증: 오늘 수행한 핵심 퀘스트를 먼저 인증해요.</li>
            <li>• 추가 인증: 같은 날 추가 실천은 '추가 기록'으로 저장되고 필요시 공개 전환할 수 있어요.</li>
            <li>• 보완: 실패한 Day는 보완 인증(70% 점수)으로 연결할 수 있어요.</li>
          </ul>
        </section>

        {/* 내가 만든 챌린지 (모바일) */}
        <div className="lg:hidden">
          <MyCreatedChallengesSection />
        </div>

        {!isLoading && (
          <button
            onClick={() => navigate('/challenges')}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 hover:border-primary-400 hover:text-primary-500 transition-colors font-medium"
          >
            + 새 챌린지 참여하기
          </button>
        )}
      </div>

    </div>
  );
};
