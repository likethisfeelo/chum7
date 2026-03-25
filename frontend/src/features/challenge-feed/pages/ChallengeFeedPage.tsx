import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiArrowLeft } from "react-icons/fi";
import { useAuthStore } from "@/stores/authStore";
import toast from "react-hot-toast";
import { apiClient } from "@/lib/api-client";
import { Loading } from "@/shared/components/Loading";
import { resolveMediaUrl } from "@/shared/utils/mediaUrl";
import { InlineVerificationForm } from "@/features/verification/components/InlineVerificationForm";
import { BottomSheet } from "@/shared/components/BottomSheet";
import { LinkPreviewCard } from "@/shared/components/LinkPreviewCard";
import {
  getRemedyType,
  getRemainingRemedyCount,
} from "@/features/challenge/utils/flowPolicy";

const FeedVideo = ({ src }: { src: string }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          const playPromise = element.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
          }
          return;
        }
        element.pause();
      },
      { threshold: [0, 0.6, 1] },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      element.pause();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      loop
      muted
      playsInline
      preload="metadata"
      className="mt-2 w-full rounded-lg border border-gray-100 bg-black"
    />
  );
};

function isSameKstDate(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const toKstKey = (date: Date) => {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  };
  return toKstKey(d) === toKstKey(now);
}

function getKstDateOnly(): Date {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

function computeTodayChallengeDay(userChallenge: any): number {
  const start =
    userChallenge?.challenge?.actualStartAt ||
    userChallenge?.challenge?.startConfirmedAt ||
    userChallenge?.startDate ||
    userChallenge?.challenge?.startDate ||
    userChallenge?.challenge?.startAt;
  if (!start) return Math.max(1, Number(userChallenge?.currentDay || 1));

  const dateOnlyMatch = (typeof start === "string") && start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let startDate: Date;
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    startDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  } else {
    const parsed = new Date(start);
    if (Number.isNaN(parsed.getTime())) return Math.max(1, Number(userChallenge?.currentDay || 1));
    const kstMs = parsed.getTime() + 9 * 60 * 60 * 1000;
    const kst = new Date(kstMs);
    startDate = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  }
  const today = getKstDateOnly();
  const elapsed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, elapsed + 1);
}

export const ChallengeFeedPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: challengeData, isLoading: isChallengeLoading } = useQuery({
    queryKey: ["challenge-feed", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenges/${challengeId}`);
      return response.data?.data;
    },
  });

  const { data: myChallengesData } = useQuery({
    queryKey: ["challenge-feed-my-challenges", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get("/challenges/my?status=all");
      return response.data?.data?.challenges || [];
    },
  });

  const userChallenge = useMemo(
    () =>
      (myChallengesData || []).find(
        (item: any) =>
          item.challengeId === challengeId ||
          item.challenge?.challengeId === challengeId,
      ),
    [myChallengesData, challengeId],
  );

  const { data: boardData, isLoading: isBoardLoading } = useQuery({
    queryKey: ["challenge-board", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/challenge-board/${challengeId}`);
      return response.data;
    },
  });

  const { data: verificationData, isLoading: isVerificationsLoading } = useQuery({
    queryKey: ["challenge-feed-verifications", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(
        `/verifications?isPublic=true&limit=50&challengeId=${challengeId}`,
      );
      return response.data?.data?.verifications || [];
    },
  });

  const { data: myVerificationData, isLoading: isMyVerificationsLoading } = useQuery({
    queryKey: ["challenge-feed-my-verifications", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(
        `/verifications?mine=true&limit=50&challengeId=${challengeId}`,
      );
      return response.data?.data?.verifications || [];
    },
  });

  const { data: questsData } = useQuery({
    queryKey: ["challenge-quests", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/quests?challengeId=${challengeId}&status=active`);
      return res.data?.data?.quests ?? [];
    },
  });

  const { data: myProposalData } = useQuery({
    queryKey: ["challenge-my-proposal", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/challenges/${challengeId}/personal-quest`);
      return res.data?.data ?? { latestProposal: null, proposals: [] };
    },
  });

  // 탭 상태
  const [activeQuestTab, setActiveQuestTab] = useState<"leader" | "personal">("leader");
  const [feedTab, setFeedTab] = useState<"leader" | "personal">("leader");
  const [expandedLeaderQuestId, setExpandedLeaderQuestId] = useState<string | null>(null);
  const [todaySubmittedQuestIds, setTodaySubmittedQuestIds] = useState<Set<string>>(new Set());
  const [isProposalFormOpen, setIsProposalFormOpen] = useState(false);
  const [proposalForm, setProposalForm] = useState({
    title: "",
    description: "",
    allowedVerificationTypes: ["image", "text", "link", "video"] as string[],
  });
  const [showGiveUpConfirm, setShowGiveUpConfirm] = useState(false);
  const [openVideoPickerSignal, setOpenVideoPickerSignal] = useState(0);
  const handleVerificationSuccess = (_data: any) => {
    queryClient.invalidateQueries({ queryKey: ["challenge-feed-verifications", challengeId] });
    queryClient.invalidateQueries({ queryKey: ["challenge-feed-my-verifications", challengeId] });
    queryClient.invalidateQueries({ queryKey: ["challenge-quests", challengeId] });
    queryClient.invalidateQueries({ queryKey: ["my-challenges"] });
  };

  // 퀘스트 분류 및 정렬
  const leaderQuests: any[] = useMemo(
    () =>
      (questsData || [])
        .filter((q: any) => q.questScope !== "personal")
        .sort((a: any, b: any) => {
          const oa = a.exposureOrder ?? 999;
          const ob = b.exposureOrder ?? 999;
          if (oa !== ob) return oa - ob;
          const ta = a.targetTime ?? "";
          const tb = b.targetTime ?? "";
          if (ta !== tb) return ta.localeCompare(tb);
          return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
        }),
    [questsData],
  );

  const personalQuests: any[] = useMemo(
    () => (questsData || []).filter((q: any) => q.questScope === "personal"),
    [questsData],
  );

  const personalQuest: any | null = personalQuests[0] ?? null;

  // 첫 제출 가능한 리더 퀘스트 자동 펼침
  useEffect(() => {
    if (activeQuestTab !== "leader") return;
    if (!leaderQuests.length) return;
    setExpandedLeaderQuestId((prev) => {
      if (prev) return prev;
      const first = leaderQuests.find((q: any) => {
        const s = q.mySubmission?.status;
        return s !== "approved" && s !== "auto_approved" && s !== "pending";
      });
      return first?.questId ?? null;
    });
  }, [leaderQuests, activeQuestTab]);

  const submitProposalMutation = useMutation({
    mutationFn: async () => {
      const uc = userChallenge;
      const userChallengeId = uc?.userChallengeId ?? uc?.id;
      if (!userChallengeId) throw new Error("참여 정보를 찾을 수 없습니다");
      await apiClient.post(`/challenges/${challengeId}/personal-quest`, {
        userChallengeId,
        title: proposalForm.title.trim(),
        description: proposalForm.description.trim(),
        allowedVerificationTypes: proposalForm.allowedVerificationTypes,
      });
    },
    onSuccess: () => {
      toast.success("개인 퀘스트 제안이 제출됐어요 🎯");
      setIsProposalFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["challenge-my-proposal", challengeId] });
      queryClient.invalidateQueries({ queryKey: ["challenge-quests", challengeId] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || "제안 제출에 실패했습니다");
    },
  });

  const leaderDmMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/challenge-feed/${challengeId}/leader-dm`);
      return response.data;
    },
    onSuccess: async (res: any) => {
      const threadId = res?.threadId || res?.data?.threadId;
      const deepLink = res?.deepLink || res?.data?.deepLink;
      if (threadId && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(threadId));
      }
      if (typeof deepLink === "string" && deepLink.startsWith("/messages/")) {
        toast.success("리더 DM 연결 완료");
        navigate(deepLink);
        return;
      }
      toast.success(threadId ? "리더 DM 연결 완료 (threadId 복사됨)" : "리더 DM 연결 완료");
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "리더 DM 연결에 실패했습니다");
    },
  });

  const giveUpMutation = useMutation({
    mutationFn: async () => {
      const uc = userChallenge;
      const userChallengeId = uc?.userChallengeId ?? uc?.id;
      if (!userChallengeId) throw new Error("참여 정보를 찾을 수 없습니다");
      await apiClient.post(`/user-challenges/${userChallengeId}/give-up`);
    },
    onSuccess: () => {
      toast.success("중도 포기했습니다. 포기는쉽다 뱃지가 지급되었어요.");
      setShowGiveUpConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["challenge-feed-my-challenges", challengeId] });
      queryClient.invalidateQueries({ queryKey: ["my-challenges"] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || "중도 포기에 실패했습니다");
      setShowGiveUpConfirm(false);
    },
  });

  // 보드 첫 번째 텍스트 블록 미리보기
  const boardPreviewText = useMemo(() => {
    const blocks = boardData?.blocks || [];
    const textBlock = blocks.find((b: any) => b.type === "text" && b.content);
    return textBlock?.content || "아직 챌린지 보드 안내가 등록되지 않았습니다.";
  }, [boardData]);

  const challengeVerifications = useMemo(() => verificationData || [], [verificationData]);
  const myChallengeVerifications = useMemo(() => myVerificationData || [], [myVerificationData]);

  // 인증피드 탭별 필터
  const leaderFeedVerifications = useMemo(
    () => challengeVerifications.filter((v: any) => !v.questType || v.questType === "leader"),
    [challengeVerifications],
  );
  const personalFeedVerifications = useMemo(
    () => challengeVerifications.filter((v: any) => v.questType === "personal"),
    [challengeVerifications],
  );
  const currentFeedVerifications = feedTab === "leader" ? leaderFeedVerifications : personalFeedVerifications;

  const todayCompletedCount = useMemo(
    () => challengeVerifications.filter((item: any) => isSameKstDate(item.performedAt || item.createdAt)).length,
    [challengeVerifications],
  );

  const iDidTodayVerification = useMemo(
    () => myChallengeVerifications.some((item: any) => !item.isExtra && isSameKstDate(item.performedAt || item.createdAt)),
    [myChallengeVerifications],
  );


  // 리더 퀘스트 N개 모두 완료 여부 (mySubmission 기반 + 낙관적 상태)
  const allLeaderQuestsDoneToday = useMemo(
    () =>
      leaderQuests.length > 0 &&
      leaderQuests.every((q: any) =>
        todaySubmittedQuestIds.has(q.questId) ||
        q.mySubmission?.status === "approved" ||
        q.mySubmission?.status === "auto_approved",
      ),
    [leaderQuests, todaySubmittedQuestIds],
  );

  const someLeaderQuestsDoneToday = useMemo(
    () =>
      leaderQuests.some((q: any) =>
        todaySubmittedQuestIds.has(q.questId) ||
        q.mySubmission?.status === "approved" ||
        q.mySubmission?.status === "auto_approved",
      ),
    [leaderQuests, todaySubmittedQuestIds],
  );

  const iDidTodayPersonalQuestVerification = useMemo(
    () =>
      myChallengeVerifications.some(
        (item: any) => !item.isExtra && isSameKstDate(item.performedAt || item.createdAt) && item.questType === "personal",
      ),
    [myChallengeVerifications],
  );

  const myTotalCount = myChallengeVerifications.length;
  const canCheerNow = iDidTodayVerification;

  const hasInvalidMyVideo = useMemo(
    () => myChallengeVerifications.some((item: any) => item.verificationType === "video" && item.mediaValidationStatus === "invalid"),
    [myChallengeVerifications],
  );

  const hasPendingVideoValidation = useMemo(
    () =>
      [...challengeVerifications, ...myChallengeVerifications].some(
        (item: any) => item.verificationType === "video" && item.mediaValidationStatus === "pending",
      ),
    [challengeVerifications, myChallengeVerifications],
  );

  useEffect(() => {
    if (!hasPendingVideoValidation || !challengeId) return;
    const timer = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["challenge-feed-verifications", challengeId] });
      queryClient.invalidateQueries({ queryKey: ["challenge-feed-my-verifications", challengeId] });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [hasPendingVideoValidation, challengeId, queryClient]);

  if (!challengeId) {
    return <div className="p-6 text-sm text-gray-500">challengeId가 필요합니다.</div>;
  }

  if (isChallengeLoading || isBoardLoading || isVerificationsLoading || isMyVerificationsLoading) {
    return <Loading fullScreen />;
  }

  const challengeType = challengeData?.challengeType || "leader_personal";
  const isMixedChallengeType = challengeType === "leader_personal" || challengeType === "mixed";
  const isActive = (() => {
    const lc = challengeData?.lifecycle;
    if (lc === "active") return true;
    if (lc === "preparing" && !challengeData?.requireStartConfirmation && challengeData?.challengeStartAt) {
      return challengeData.challengeStartAt <= new Date().toISOString();
    }
    return false;
  })();
  const isLeader = challengeData?.leaderId === user?.userId;
  const isGaveUp = userChallenge?.phase === "gave_up" || userChallenge?.status === "gave_up";
  const canGiveUp = Boolean(userChallenge) && !isLeader && !isGaveUp && isActive;

  // 퀘스트 진행 현황 계산
  const durationDays = challengeData?.durationDays || userChallenge?.durationDays || userChallenge?.challenge?.durationDays || 7;
  const todayDay = userChallenge ? computeTodayChallengeDay(userChallenge) : 1;
  const progressList: any[] = userChallenge?.progress || [];

  const isTodayAllDone = isMixedChallengeType
    ? allLeaderQuestsDoneToday && (personalQuest === null || iDidTodayPersonalQuestVerification)
    : leaderQuests.length > 0
      ? allLeaderQuestsDoneToday
      : iDidTodayVerification;

  return (
    <div className="min-h-screen">
      <div className="mx-auto min-h-screen w-full max-w-3xl lg:max-w-6xl pb-20">

        {/* 헤더 */}
        <div className="sticky top-0 glass-header px-6 py-4 flex items-center gap-4 z-10">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">챌린지 피드</h1>
          {canGiveUp && (
            <button
              type="button"
              onClick={() => setShowGiveUpConfirm(true)}
              className="text-xs text-gray-400 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
            >
              중도 포기
            </button>
          )}
        </div>

        {/* 중도 포기 확인 모달 */}
        {showGiveUpConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
              <h2 className="text-lg font-bold text-gray-900 mb-2">중도 포기하시겠어요?</h2>
              <p className="text-sm text-gray-600 mb-1">포기는 취소할 수 없습니다.</p>
              <p className="text-sm text-gray-600 mb-4">
                포기 후에는 인증 게시물을 올릴 수 없지만, 챌린지 피드는 계속 볼 수 있어요. 포기는쉽다 뱃지가 지급됩니다.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowGiveUpConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium text-sm"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => giveUpMutation.mutate()}
                  disabled={giveUpMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm disabled:opacity-50"
                >
                  {giveUpMutation.isPending ? "처리 중..." : "포기하기"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 lg:p-6">
          <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-6 lg:items-start">

          {/* ── Left Sidebar ── */}
          <div className="space-y-4 lg:sticky lg:top-20">

          {/* 1) 챌린지 제목 + 설명 */}
          <section className="glass-card rounded-2xl p-5">
            <div className="flex items-start gap-3 mb-2">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{challengeData?.title || "챌린지"}</h2>
                {challengeData?.category && (
                  <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 bg-gray-100 text-gray-600">
                    {challengeData.category}
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-600">{challengeData?.description || "챌린지 소개를 불러오지 못했습니다."}</p>
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="text-xs text-gray-400">참여자</p>
                <p className="text-base font-bold text-gray-800">{challengeData?.stats?.totalParticipants || challengeData?.participantCount || 0}명</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">완료율</p>
                <p className="text-base font-bold text-gray-800">{challengeData?.stats?.completionRate || 0}%</p>
              </div>
            </div>
          </section>

          {/* 3) 퀘스트 기간 진행 현황 (1~durationDays 체크) */}
          {userChallenge && (
            <section className="glass-card rounded-2xl p-5">
              <h3 className="font-bold text-gray-900 mb-3">진행 현황</h3>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: durationDays }, (_, i) => i + 1).map((day) => {
                  const p = progressList.find((pr: any) => Number(pr?.day) === day);
                  const isToday = day === todayDay;
                  const isDone = isMixedChallengeType
                    ? Boolean(p?.leaderQuestDone && p?.personalQuestDone) ||
                      (isToday && allLeaderQuestsDoneToday && (personalQuest === null || iDidTodayPersonalQuestVerification))
                    : p?.status === "success" || p?.status === "completed" || p?.status === "remedy" ||
                      (isToday && (leaderQuests.length > 0 ? allLeaderQuestsDoneToday : iDidTodayVerification));
                  const isPartial = isMixedChallengeType
                    ? Boolean(p && !isDone && (p?.leaderQuestDone || p?.personalQuestDone)) ||
                      (isToday && !isDone && (someLeaderQuestsDoneToday || iDidTodayPersonalQuestVerification))
                    : p?.status === "partial" ||
                      (isToday && !isDone && leaderQuests.length > 0 && someLeaderQuestsDoneToday);
                  const isPastMissed = day < todayDay && !isDone;

                  return (
                    <div
                      key={day}
                      title={
                        isDone && isToday ? `Day ${day} 완료 (오늘)` :
                        isDone ? `Day ${day} 완료` :
                        isToday ? "오늘" :
                        isPastMissed ? `Day ${day} 미인증` :
                        `Day ${day}`
                      }
                      className={[
                        "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                        isDone && isToday
                          ? "bg-emerald-500 text-white ring-2 ring-offset-1 ring-blue-400"
                          : isDone
                          ? "bg-emerald-500 text-white"
                          : isPartial
                          ? "bg-yellow-300 text-yellow-800"
                          : isToday
                          ? "bg-gray-100 text-gray-600 ring-2 ring-blue-400"
                          : isPastMissed
                          ? "bg-red-50 text-red-300 border border-red-100"
                          : "bg-gray-100 text-gray-400",
                      ].join(" ")}
                    >
                      {isDone ? "✓" : day}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> 인증완료</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-100 ring-1 ring-blue-400 inline-block" /> 오늘</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 ring-1 ring-blue-400 ring-offset-1 inline-block" /> 오늘+완료</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-50 border border-red-100 inline-block" /> 미인증</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-100 inline-block" /> 예정</span>
                {isMixedChallengeType && <span className="text-gray-400">· 리더+개인 퀘스트 모두 완료해야 ✓</span>}
              </div>
            </section>
          )}

          {/* 8) 오늘 인증완료 / 전체 참여자 — left sidebar desktop */}
          <section className="hidden lg:grid grid-cols-2 gap-2">
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs text-gray-500">오늘 인증</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{todayCompletedCount}명</p>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs text-gray-500">내 인증</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{myTotalCount}회</p>
            </div>
          </section>

          {/* My record — left sidebar desktop */}
          {userChallenge && (
            <section className="hidden lg:block glass-card rounded-2xl p-5">
              <h3 className="font-bold text-gray-900 mb-3">내 기록</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card rounded-xl p-3">
                  <p className="text-xs text-gray-500">총 인증</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{myTotalCount}회</p>
                </div>
                <div className="glass-card rounded-xl p-3">
                  <p className="text-xs text-gray-500">연속 인증</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{userChallenge?.consecutiveDays ?? 0}일</p>
                </div>
              </div>
              <div className={`mt-3 rounded-xl px-4 py-3 text-sm font-medium ${canCheerNow ? "bg-primary-50 text-primary-700" : "bg-gray-50 text-gray-500"}`}>
                {canCheerNow ? "🎟 오늘 인증 완료! 다른 참여자를 응원할 수 있어요." : "오늘 인증 후 응원권 기능이 열립니다."}
              </div>
            </section>
          )}

          </div>{/* ── End Left Sidebar ── */}

          {/* ── Right Main Content ── */}
          <div className="space-y-4 mt-4 lg:mt-0">

          {/* 중도 포기 배너 */}
          {isGaveUp && (
            <section className="bg-red-50 rounded-2xl p-5 border border-red-100 shadow-sm">
              <h3 className="font-bold text-red-800 mb-1">🏳️ 중도 포기한 챌린지</h3>
              <p className="text-sm text-red-700">인증 게시물 업로드가 제한되지만, 다른 참여자의 인증 피드는 계속 볼 수 있어요.</p>
            </section>
          )}

          {/* 2) 챌린지 보드 미리보기 */}
          <section
            className="glass-card rounded-2xl p-5 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(`/challenge-board/${challengeId}`)}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-900">챌린지 보드</h3>
              <span className="text-xs font-semibold text-primary-600">전체 보기 →</span>
            </div>
            <p className="text-sm text-gray-700 line-clamp-3">{boardPreviewText}</p>
          </section>

          {/* 개인 퀘스트 제안 섹션 */}
          {challengeData?.personalQuestEnabled && (() => {
            const proposal = myProposalData?.latestProposal ?? null;
            const lifecycle = challengeData?.lifecycle as string;
            const canSubmit = ["recruiting", "preparing"].includes(lifecycle);
            const statusLabel: Record<string, string> = {
              pending: "⏳ 심사 중",
              revision_pending: "⏳ 재심사 중",
              approved: "✅ 승인됨",
              rejected: "↩️ 반려됨",
              expired: "⛔ 만료됨",
            };
            return (
              <section className="bg-amber-50 rounded-2xl p-5 border border-amber-100 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-amber-900">📋 나의 개인 퀘스트 제안</h3>
                </div>
                {proposal ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        proposal.status === "approved" ? "bg-green-100 text-green-700"
                        : proposal.status === "rejected" || proposal.status === "expired" ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {statusLabel[proposal.status] ?? proposal.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-amber-900">{proposal.title}</p>
                    {proposal.description && <p className="text-xs text-amber-700 line-clamp-2">{proposal.description}</p>}
                    {proposal.leaderFeedback && (
                      <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">💬 리더 피드백: {proposal.leaderFeedback}</p>
                    )}
                    {canSubmit && (
                      <button
                        type="button"
                        onClick={() => {
                          setProposalForm({ title: proposal.title, description: proposal.description || "", allowedVerificationTypes: proposal.allowedVerificationTypes ?? ["image", "text", "link", "video"] });
                          setIsProposalFormOpen(true);
                        }}
                        className="mt-1 text-xs font-semibold text-amber-700 underline"
                      >
                        수정 제출하기 →
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    {canSubmit ? (
                      <>
                        <p className="text-sm text-amber-700 mb-3">아직 개인 퀘스트 제안서가 없어요. 챌린지 시작 전에 제출해주세요.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setProposalForm({ title: "", description: "", allowedVerificationTypes: challengeData?.allowedVerificationTypes ?? ["image", "text", "link", "video"] });
                            setIsProposalFormOpen(true);
                          }}
                          className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold"
                        >
                          개인 퀘스트 제안하기 🎯
                        </button>
                      </>
                    ) : (
                      <p className="text-sm text-amber-700">
                        {lifecycle === "active" ? "챌린지가 시작됐어요. 개인 퀘스트 제안 마감이 지났습니다." : "개인 퀘스트 제안 기간이 아닙니다."}
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })()}

          {/* 개인 퀘스트 제안 BottomSheet */}
          <BottomSheet isOpen={isProposalFormOpen} onClose={() => setIsProposalFormOpen(false)} title="개인 퀘스트 제안">
            <div className="px-6 pb-8 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">퀘스트 제목 <span className="text-red-500">*</span></label>
                <input
                  value={proposalForm.title}
                  maxLength={100}
                  onChange={(e) => setProposalForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="나만의 퀘스트 제목을 입력하세요"
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">퀘스트 설명 <span className="text-red-500">*</span></label>
                <textarea
                  value={proposalForm.description}
                  maxLength={1000}
                  rows={4}
                  onChange={(e) => setProposalForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="어떻게 실천할지 구체적으로 적어주세요"
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-xl text-sm resize-none"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">허용 인증 방식</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["image", "text", "link", "video"] as const).map((vt) => {
                    const label = vt === "image" ? "📸 사진" : vt === "text" ? "✍️ 텍스트" : vt === "link" ? "🔗 링크" : "🎥 영상";
                    const isChecked = proposalForm.allowedVerificationTypes.includes(vt);
                    return (
                      <button
                        key={vt}
                        type="button"
                        onClick={() =>
                          setProposalForm((p) => {
                            const next = isChecked ? p.allowedVerificationTypes.filter((t) => t !== vt) : [...p.allowedVerificationTypes, vt];
                            return { ...p, allowedVerificationTypes: next.length > 0 ? next : p.allowedVerificationTypes };
                          })
                        }
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm ${isChecked ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-700"}`}
                      >
                        {isChecked ? "✓" : "○"} {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                disabled={!proposalForm.title.trim() || !proposalForm.description.trim() || submitProposalMutation.isPending}
                onClick={() => submitProposalMutation.mutate()}
                className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold disabled:opacity-40"
              >
                {submitProposalMutation.isPending ? "제출 중..." : "제안 제출하기 🚀"}
              </button>
            </div>
          </BottomSheet>

          {/* 4) 인증 업로드 / 인증완료 */}

          {/* 오늘의 퀘스트 인증 — active + 퀘스트 있을 때 */}
          {isActive && questsData && questsData.length > 0 && userChallenge && !isGaveUp && (
            <section className="glass-card rounded-2xl p-5">
              {/* 탭 — 혼합형만 */}
              {isMixedChallengeType && (
                <div className="flex gap-1 mb-4 p-1 glass-card rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveQuestTab("leader");
                      const first = leaderQuests.find((q: any) => {
                        const s = q.mySubmission?.status;
                        return s !== "approved" && s !== "auto_approved" && s !== "pending";
                      });
                      setExpandedLeaderQuestId(first?.questId ?? null);
                    }}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${activeQuestTab === "leader" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                  >
                    🎯 리더 퀘스트
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveQuestTab("personal"); setExpandedLeaderQuestId(null); }}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${activeQuestTab === "personal" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                  >
                    🌱 개인 퀘스트
                  </button>
                </div>
              )}

              {/* 리더 퀘스트 목록 */}
              {challengeType !== "personal_only" && (!isMixedChallengeType || activeQuestTab === "leader") && (
                <div className="space-y-3">
                  {leaderQuests.map((q: any) => {
                    const sub = q.mySubmission;
                    const isDone =
                      todaySubmittedQuestIds.has(q.questId) ||
                      sub?.status === "approved" ||
                      sub?.status === "auto_approved";
                    const isPending = !isDone && sub?.status === "pending";
                    const isExpanded = expandedLeaderQuestId === q.questId;
                    return (
                      <div key={q.questId} className="rounded-xl bg-blue-50 border border-blue-100 overflow-hidden">
                        <div className="flex items-center gap-3 p-3">
                          <span className="text-2xl shrink-0">{q.icon || "🎯"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{q.title}</p>
                            <p className="text-xs text-blue-600 mt-0.5">+{q.rewardPoints}pt{q.approvalRequired ? " · 관리자 검토" : ""}</p>
                          </div>
                          {isDone ? (
                            <span className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full shrink-0">완료 ✅</span>
                          ) : isPending ? (
                            <span className="text-xs px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full shrink-0">심사중 🔄</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setExpandedLeaderQuestId(isExpanded ? null : q.questId)}
                              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-xl shrink-0"
                            >
                              {sub?.status === "rejected" ? "재제출 ↩️" : isExpanded ? "접기 ▲" : "인증하기 ▼"}
                            </button>
                          )}
                        </div>
                        {isExpanded && !isDone && !isPending && (
                          <div className="px-3 pb-3 border-t border-blue-100 pt-3">
                            <InlineVerificationForm
                              userChallenge={userChallenge}
                              quest={q}
                              onSuccess={(data) => {
                                setExpandedLeaderQuestId(null);
                                setTodaySubmittedQuestIds(prev => new Set([...prev, q.questId]));
                                handleVerificationSuccess(data);
                              }}
                              onQuestSuccess={() => queryClient.invalidateQueries({ queryKey: ["challenge-quests", challengeId] })}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 개인 퀘스트 */}
              {challengeType !== "leader_only" && (!isMixedChallengeType || activeQuestTab === "personal") && (
                <div>
                  {personalQuest ? (() => {
                    const sub = personalQuest.mySubmission;
                    const isDone =
                      todaySubmittedQuestIds.has(personalQuest.questId) ||
                      sub?.status === "approved" ||
                      sub?.status === "auto_approved" ||
                      (isMixedChallengeType ? iDidTodayPersonalQuestVerification : iDidTodayVerification);
                    const isPending = !isDone && sub?.status === "pending";
                    return (
                      <div className="rounded-xl bg-amber-50 border border-amber-100 overflow-hidden">
                        <div className="flex items-center gap-3 p-3">
                          <span className="text-2xl shrink-0">{personalQuest.icon || "🌱"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{personalQuest.title}</p>
                            <p className="text-xs text-amber-600 mt-0.5">+{personalQuest.rewardPoints}pt{personalQuest.approvalRequired ? " · 관리자 검토" : ""}</p>
                          </div>
                          {isDone && <span className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full shrink-0">완료 ✅</span>}
                          {isPending && <span className="text-xs px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full shrink-0">심사중 🔄</span>}
                        </div>
                        {!isDone && !isPending && (
                          <div className="px-3 pb-3 border-t border-amber-100 pt-3">
                            <InlineVerificationForm
                              userChallenge={userChallenge}
                              quest={personalQuest}
                              defaultExpanded
                              onSuccess={(data) => {
                                setTodaySubmittedQuestIds(prev => new Set([...prev, personalQuest.questId]));
                                handleVerificationSuccess(data);
                              }}
                              onQuestSuccess={() => queryClient.invalidateQueries({ queryKey: ["challenge-quests", challengeId] })}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2.5">
                      {myProposalData?.latestProposal?.status === "pending" || myProposalData?.latestProposal?.status === "revision_pending"
                        ? "⏳ 개인 퀘스트 승인 대기 중입니다."
                        : "개인 퀘스트가 없습니다. 제안 섹션에서 제출해주세요."}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 퀘스트 없을 때 일반 인증 폼 */}
          {(!questsData || questsData.length === 0 || (challengeType === "leader_only" && leaderQuests.length === 0)) &&
            (!iDidTodayVerification || hasInvalidMyVideo) &&
            userChallenge &&
            !isGaveUp && (
              <section className="glass-card rounded-2xl p-5">
                <h3 className="font-bold text-gray-900 mb-3">오늘의 인증</h3>
                <InlineVerificationForm
                  userChallenge={userChallenge}
                  allowedVerificationTypes={challengeData?.allowedVerificationTypes}
                  onSuccess={handleVerificationSuccess}
                  openVideoPickerSignal={openVideoPickerSignal}
                />
              </section>
            )}

          {/* 인증 완료 메시지 */}
          {isTodayAllDone && !hasInvalidMyVideo && (
            <section className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 shadow-sm">
              <h3 className="font-bold text-emerald-800">✅ 오늘 인증 완료!</h3>
              <p className="text-sm text-emerald-700 mt-1">이제 다른 참여자를 응원할 수 있어요.</p>
            </section>
          )}

          {/* 5) 인증 피드 — 리더퀘스트 / 개인퀘스트 탭 */}
          <section className="glass-card rounded-2xl p-5">
            <h3 className="font-bold text-gray-900 mb-3">인증 피드</h3>
            <div className="flex gap-1 mb-4 p-1 glass-card rounded-xl">
              <button
                type="button"
                onClick={() => setFeedTab("leader")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${feedTab === "leader" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                🎯 리더퀘스트 {leaderFeedVerifications.length > 0 && <span className="ml-1 text-xs text-gray-400">{leaderFeedVerifications.length}</span>}
              </button>
              <button
                type="button"
                onClick={() => setFeedTab("personal")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${feedTab === "personal" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                🌱 개인퀘스트 {personalFeedVerifications.length > 0 && <span className="ml-1 text-xs text-gray-400">{personalFeedVerifications.length}</span>}
              </button>
            </div>
            <div className="space-y-3">
              {currentFeedVerifications.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  {feedTab === "leader" ? "아직 올라온 리더퀘스트 인증이 없습니다." : "아직 올라온 개인퀘스트 인증이 없습니다."}
                </p>
              ) : (
                currentFeedVerifications.map((item: any) => (
                  <article key={item.verificationId} className="glass-card rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500">{item.isAnonymous ? "익명 참여자" : item.userName || "참여자"}</p>
                      <p className="text-xs text-gray-400">Day {item.day || "-"}</p>
                    </div>
                    {item.todayNote && (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.todayNote}</p>
                    )}
                    {item.verificationType === "video" && item.mediaValidationStatus === "invalid" && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-2 space-y-2">
                        <p>영상 검증에서 문제가 발견되었습니다. 다시 업로드 해주세요.</p>
                        {item.userId === userChallenge?.userId && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenVideoPickerSignal((prev) => prev + 1);
                              toast("영상 다시 인증을 시작합니다.", { icon: "📹" });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="px-2 py-1 rounded border border-red-300 bg-white text-red-700"
                          >
                            영상 다시 인증하기
                          </button>
                        )}
                      </div>
                    )}
                    {item.verificationType === "video" && item.mediaValidationStatus === "pending" && (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                        영상 메타데이터 검증 진행중입니다.
                      </p>
                    )}
                    {item.verificationType === "image" && item.imageUrl && (
                      <img src={resolveMediaUrl(item.imageUrl)} alt="verification" className="mt-2 w-full rounded-lg border border-gray-100" />
                    )}
                    {item.verificationType === "video" && item.videoUrl && (
                      <FeedVideo src={resolveMediaUrl(item.videoUrl)} />
                    )}
                    {item.verificationType === "link" && item.linkUrl && (
                      <LinkPreviewCard url={item.linkUrl} />
                    )}
                  </article>
                ))
              )}
            </div>
          </section>

          {/* 6) 리더퀘스트 보드 (2개 이상일 경우에만) */}
          {leaderQuests.length >= 2 && (
            <section
              className="glass-card rounded-2xl p-5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/quests?challengeId=${challengeId}&scope=leader`)}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">🎯 리더퀘스트 보드</h3>
                <span className="text-xs font-semibold text-blue-600">전체 보기 →</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">퀘스트 {leaderQuests.length}개 진행 중</p>
              <div className="mt-3 space-y-1.5">
                {leaderQuests.slice(0, 3).map((q: any) => (
                  <div key={q.questId} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-base">{q.icon || "🎯"}</span>
                    <span className="flex-1 truncate">{q.title}</span>
                    <span className="text-xs text-gray-400">+{q.rewardPoints}pt</span>
                  </div>
                ))}
                {leaderQuests.length > 3 && (
                  <p className="text-xs text-gray-400">+{leaderQuests.length - 3}개 더</p>
                )}
              </div>
            </section>
          )}

          {/* 7) 개인퀘스트 보드 (2개 이상일 경우에만) */}
          {personalQuests.length >= 2 && (
            <section
              className="glass-card rounded-2xl p-5 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/quests?challengeId=${challengeId}&scope=personal`)}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">🌱 개인퀘스트 보드</h3>
                <span className="text-xs font-semibold text-amber-600">전체 보기 →</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">퀘스트 {personalQuests.length}개</p>
            </section>
          )}

          {/* 8) 오늘 인증완료 / 전체 참여자 — mobile only */}
          <section className="lg:hidden grid grid-cols-2 gap-2">
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs text-gray-500">오늘 인증 완료</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{todayCompletedCount}명</p>
              <p className="text-xs text-gray-500">KST 기준</p>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs text-gray-500">전체 참여자</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {challengeData?.stats?.totalParticipants || challengeData?.participantCount || 0}명
              </p>
              <p className="text-xs text-gray-500">챌린지 누적</p>
            </div>
          </section>

          {/* 9) 보완인증 */}
          {(() => {
            if (!userChallenge) return null;
            if (isGaveUp) return null;
            const remedyType = getRemedyType(userChallenge.remedyPolicy);
            if (remedyType === "disabled") return null;
            const remaining = getRemainingRemedyCount(userChallenge.remedyPolicy, userChallenge.progress || []);
            const failedDays = (userChallenge.progress || []).filter(
              (p: any) => p.day <= 5 && p.status !== "success" && !p.remedied,
            );
            const canRemedy = (remaining === null || remaining > 0) && failedDays.length > 0;
            return (
              <section className="glass-card rounded-2xl p-5">
                <h3 className="font-bold text-gray-900 mb-2">보완 인증</h3>
                <p className="text-xs text-gray-500 mb-3">
                  실패한 Day는 보완 인증(70% 점수)으로 연결할 수 있어요. · 남은 보완{" "}
                  {remaining === null ? "제한 없음" : `${remaining}회`}
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/verification/remedy?userChallengeId=${userChallenge.userChallengeId}`)}
                  disabled={!canRemedy}
                  className="w-full py-2.5 rounded-xl border border-purple-200 text-purple-700 bg-purple-50 disabled:opacity-40 text-sm font-medium hover:bg-purple-100 transition-colors"
                >
                  보완하기 {remaining === null ? "(제한 없음)" : `(${remaining}회 남음)`}
                </button>
              </section>
            );
          })()}

          {/* 10) 내 응원권/기록 현황 — mobile only */}
          {userChallenge && (
            <section className="lg:hidden glass-card rounded-2xl p-5">
              <h3 className="font-bold text-gray-900 mb-3">내 응원권 / 기록</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card rounded-xl p-3">
                  <p className="text-xs text-gray-500">총 인증 횟수</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{myTotalCount}회</p>
                </div>
                <div className="glass-card rounded-xl p-3">
                  <p className="text-xs text-gray-500">연속 인증</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">
                    {userChallenge?.consecutiveDays ?? 0}일
                  </p>
                </div>
              </div>
              <div className={`mt-3 rounded-xl px-4 py-3 text-sm font-medium ${canCheerNow ? "bg-primary-50 text-primary-700" : "bg-gray-50 text-gray-500"}`}>
                {canCheerNow
                  ? "🎟 오늘 인증 완료! 피드에서 다른 참여자를 응원할 수 있어요."
                  : "오늘 인증 후 응원권 기능이 열립니다."}
              </div>
            </section>
          )}

          {/* 리더 DM */}
          <button
            type="button"
            onClick={() => leaderDmMutation.mutate()}
            disabled={leaderDmMutation.isPending}
            className="w-full py-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-semibold disabled:opacity-50"
          >
            {leaderDmMutation.isPending ? "DM 연결중..." : "리더 DM"}
          </button>

          </div>{/* ── End Right Main ── */}
          </div>{/* ── End Grid ── */}
        </div>{/* ── End p-4 wrapper ── */}
      </div>

    </div>
  );
};
