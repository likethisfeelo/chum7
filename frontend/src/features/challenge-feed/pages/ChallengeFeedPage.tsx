import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiArrowLeft } from "react-icons/fi";
import { useAuthStore } from "@/stores/authStore";
import { LeaderOpsTab } from "../components/LeaderOpsTab";
import { VerificationComments } from "../components/VerificationComments";
import toast from "react-hot-toast";
import { apiClient } from "@/lib/api-client";
import { Loading } from "@/shared/components/Loading";
import { resolveMediaUrl } from "@/shared/utils/mediaUrl";
import { ImageCarousel } from "@/shared/components/ImageCarousel";
import { InlineVerificationForm } from "@/features/verification/components/InlineVerificationForm";
import { BottomSheet } from "@/shared/components/BottomSheet";
import { BoardGuideSection } from "@/features/challenge-board/components/BoardGuideSection";
import { LinkPreviewCard } from "@/shared/components/LinkPreviewCard";
import { challengeApi } from "@/features/challenge/api/challengeApi";
import { SLUG_TO_LABEL } from "@/features/challenge/constants/categories";
import { ChallengeChatPanel } from "@/features/challenge-chat/components/ChallengeChatPanel";
import {
  getRemedyType,
  getRemainingRemedyCount,
} from "@/features/challenge/utils/flowPolicy";

// ─── 이모지 반응 상수 ──────────────────────────────────────────────────
// DB에서는 모두 '좋아요'로 처리되고, 여기서는 피드 내 재미용(슬랙 스타일·익명).
// 다양성보다 어느 기기에서나 깨지지 않는 기본 이모지 소수만 노출한다.
const REACTION_EMOJIS = [
  { emoji: "👍", label: "좋아요" },
  { emoji: "❤️", label: "하트" },
  { emoji: "🔥", label: "불꽃" },
  { emoji: "👏", label: "박수" },
  { emoji: "🎉", label: "축하" },
  { emoji: "😂", label: "웃겨요" },
] as const;

type EmojiReaction = { emoji: string; count: number; myReacted: boolean };

// ─── 이모지 반응 컴포넌트 ──────────────────────────────────────────────
function VerificationReactions({
  verificationId,
  challengeId,
  canInteract,
}: {
  verificationId: string;
  challengeId: string;
  canInteract: boolean;
}) {
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const { data: reactions = [] } = useQuery<EmojiReaction[]>({
    queryKey: ["verification-reactions", verificationId],
    queryFn: async () => {
      const res = await apiClient.get(
        `/s/challenge-feed/${challengeId}/verifications/${verificationId}/reactions`,
      );
      return res.data.data ?? [];
    },
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (emoji: string) => {
      const existing = reactions.find((r) => r.emoji === emoji);
      if (existing?.myReacted) {
        await apiClient.delete(
          `/s/challenge-feed/${challengeId}/verifications/${verificationId}/reactions`,
          { data: { emoji } },
        );
      } else {
        await apiClient.post(
          `/s/challenge-feed/${challengeId}/verifications/${verificationId}/reactions`,
          { emoji },
        );
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["verification-reactions", verificationId] }),
    onError: () => toast.error("반응 처리에 실패했어요"),
  });

  // picker 외부 클릭 시 닫기
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const activeReactions = reactions.filter((r) => r.count > 0);

  return (
    <div ref={pickerRef}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* 기존 반응 pills */}
        {activeReactions.map((r) => (
          <button
            key={r.emoji}
            onClick={() => canInteract && toggleMutation.mutate(r.emoji)}
            disabled={!canInteract || toggleMutation.isPending}
            title={!canInteract ? "챌린지 기간에만 반응할 수 있어요" : undefined}
            className={[
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all select-none",
              r.myReacted
                ? "bg-primary-100 border border-primary-300 text-primary-700"
                : "bg-white/60 border border-gray-200 text-gray-600",
              canInteract ? "hover:scale-105 active:scale-95" : "cursor-default opacity-70",
            ].join(" ")}
          >
            <span className="text-sm leading-none">{r.emoji}</span>
            <span>{r.count}</span>
          </button>
        ))}

        {/* + 반응 추가 토글 (열리면 활성 표시) */}
        {canInteract && (
          <button
            onClick={() => setShowPicker((v) => !v)}
            aria-expanded={showPicker}
            className={[
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all",
              showPicker
                ? "bg-primary-100 border border-primary-300 text-primary-700"
                : "text-gray-500 bg-white/50 border border-dashed border-gray-300 hover:bg-white/80",
            ].join(" ")}
          >
            <span className="text-base leading-none">😊</span>
            <span>+</span>
          </button>
        )}

        {/* 비활성 상태 안내 */}
        {!canInteract && activeReactions.length === 0 && (
          <span className="text-[11px] text-gray-400">반응 없음</span>
        )}
      </div>

      {/* 이모지 선택 — 인라인 확장(플로팅 오버레이 아님: 카드 내용과 겹침·투명 뒤비침·잘림 방지) */}
      {canInteract && showPicker && (
        <div className="mt-2 flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
          {REACTION_EMOJIS.map(({ emoji, label }) => {
            const existing = reactions.find((r) => r.emoji === emoji);
            return (
              <button
                key={emoji}
                onClick={() => {
                  toggleMutation.mutate(emoji);
                  setShowPicker(false);
                }}
                title={label}
                className={[
                  "w-9 h-9 flex items-center justify-center rounded-xl text-xl transition-all",
                  "hover:scale-110 active:scale-95",
                  existing?.myReacted ? "bg-primary-100 ring-1 ring-primary-300" : "hover:bg-gray-100/80",
                ].join(" ")}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


// 게시물 하단 퀘스트 정보 — 제목은 항상, 설명은 '더보기'로 펼침 (리더/개인 퀘스트 인증 구분 이모지)
function QuestInfoBlock({
  title,
  description,
  questType,
}: {
  title?: string | null;
  description?: string | null;
  questType?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!title) return null;
  const icon = questType === "personal" ? "🌱" : "🎯";
  const label = questType === "personal" ? "개인 퀘스트" : "리더 퀘스트";
  return (
    <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 leading-snug">
        {icon} {title}
      </p>
      {description && (
        <>
          {expanded && (
            <p className="mt-1 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
              {description}
            </p>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-[11px] font-medium text-primary-600 hover:text-primary-700"
          >
            {expanded ? "접기" : "더보기"}
          </button>
        </>
      )}
    </div>
  );
}

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
      const response = await apiClient.get(`/public/challenges/${challengeId}`);
      return response.data?.data;
    },
  });

  const { data: myChallengesData } = useQuery({
    queryKey: ["challenge-feed-my-challenges", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get("/c/challenges/my?status=all");
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

  const { data: verificationData, isLoading: isVerificationsLoading } = useQuery({
    queryKey: ["challenge-feed-verifications", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(
        `/c/verifications?isPublic=true&limit=50&challengeId=${challengeId}`,
      );
      return response.data?.data?.verifications || [];
    },
  });

  const { data: myVerificationData, isLoading: isMyVerificationsLoading } = useQuery({
    queryKey: ["challenge-feed-my-verifications", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(
        `/c/verifications?mine=true&limit=50&challengeId=${challengeId}`,
      );
      return response.data?.data?.verifications || [];
    },
  });

  const { data: questsData } = useQuery({
    queryKey: ["challenge-quests", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/c/${challengeId}/quests?status=active`);
      return res.data?.data?.quests ?? [];
    },
  });

  const { data: myProposalData } = useQuery({
    queryKey: ["challenge-my-proposal", challengeId],
    enabled: Boolean(challengeId),
    // challenge-api PORTING.md §7-e — 내 개인 퀘스트 제안 이력
    queryFn: () => challengeApi.getMyQuestProposals(challengeId!),
  });

  // 탭 상태
  const [searchParams] = useSearchParams();
  const [mainTab, setMainTab] = useState<"feed" | "ops">(
    searchParams.get("tab") === "ops" ? "ops" : "feed",
  );
  const [activeQuestTab, setActiveQuestTab] = useState<"leader" | "personal">("leader");
  // 인증 피드 — 리더/개인 퀘스트 섹션을 각각 펼치고 접는다(아코디언, 독립 토글)
  const [openLeaderFeed, setOpenLeaderFeed] = useState(true);
  const [openPersonalFeed, setOpenPersonalFeed] = useState(true);
  const [expandedLeaderQuestId, setExpandedLeaderQuestId] = useState<string | null>(null);
  const [todaySubmittedQuestIds, setTodaySubmittedQuestIds] = useState<Set<string>>(new Set());
  const [isProposalFormOpen, setIsProposalFormOpen] = useState(false);
  // allowedVerificationTypes 제안 필드는 신규 API v1 미이식 (challenge-api PORTING.md §7-e) — 폼에서 제외
  const [proposalForm, setProposalForm] = useState({
    title: "",
    description: "",
  });
  const [showGiveUpConfirm, setShowGiveUpConfirm] = useState(false);
  const [giveUpStep, setGiveUpStep] = useState(1);
  const [showCheerSheet, setShowCheerSheet] = useState(false);
  const [cheerSheetTab, setCheerSheetTab] = useState<"received" | "sent">("received");

  const { data: cheerRecords = [] } = useQuery({
    queryKey: ["my-cheers", cheerSheetTab],
    enabled: showCheerSheet,
    queryFn: async () => {
      const res = await apiClient.get(`/ch/cheers/my?type=${cheerSheetTab}&limit=30`);
      return res.data?.data?.cheers ?? [];
    },
  });
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
    // challenge-api PORTING.md §7-e — 제안 제출 (기존 pending/rejected 는 서버 upsert 갱신)
    mutationFn: () =>
      challengeApi.submitQuestProposal(challengeId!, {
        title: proposalForm.title.trim(),
        description: proposalForm.description.trim() || undefined,
      }),
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
      // 신규 API: leaderId는 클라이언트 제공 필수 (social-api PORTING.md gap ④)
      const leaderId = challengeData?.createdBy || challengeData?.leaderId || undefined;
      const response = await apiClient.post(`/s/board/${challengeId}/leader-dm`, { leaderId });
      return response.data;
    },
    onSuccess: () => {
      // DM 방은 (challengeId, 내 userId) — 참여자 본인 방으로 이동. 리더는 상대 참여자 방으로 열림.
      if (challengeId && user?.userId) navigate(`/dm/${challengeId}/${user.userId}`);
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
      await apiClient.post(`/c/user-challenges/${userChallengeId}/give-up`);
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

  // 리더의 인증 게시물 반려 (그날 인증만 반려 — 피드/마당에서 숨김, 본인 기록엔 유지, 점수 되돌림)
  const [rejectingVfId, setRejectingVfId] = useState<string | null>(null);
  const [rejectVfReason, setRejectVfReason] = useState("");
  const rejectVerificationMutation = useMutation({
    mutationFn: (vars: { verificationId: string; reason?: string }) =>
      challengeApi.rejectVerification(challengeId!, vars.verificationId, { reason: vars.reason }),
    onSuccess: () => {
      toast.success("인증을 반려했어요. 피드에서 숨겨지고 본인 기록에는 남아요.");
      setRejectingVfId(null);
      setRejectVfReason("");
      queryClient.invalidateQueries({ queryKey: ["challenge-feed-verifications", challengeId] });
      queryClient.invalidateQueries({ queryKey: ["challenge-feed-my-verifications", challengeId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "반려에 실패했어요"),
  });

  const challengeVerifications = useMemo(() => verificationData || [], [verificationData]);
  const myChallengeVerifications = useMemo(() => myVerificationData || [], [myVerificationData]);

  // 인증피드 탭별 필터 — 리더가 반려한 인증(rejectedByLeader)은 피드에서 제외
  const leaderFeedVerifications = useMemo(
    () => challengeVerifications.filter((v: any) => !v.rejectedByLeader && (!v.questType || v.questType === "leader")),
    [challengeVerifications],
  );
  const personalFeedVerifications = useMemo(
    () => challengeVerifications.filter((v: any) => !v.rejectedByLeader && v.questType === "personal"),
    [challengeVerifications],
  );

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

  if (isChallengeLoading || isVerificationsLoading || isMyVerificationsLoading) {
    return <Loading fullScreen />;
  }

  const challengeType = challengeData?.challengeType || "leader_personal";
  const isMixedChallengeType = challengeType === "leader_personal" || challengeType === "mixed";
  // 인증 피드 섹션 노출 — 개인 전용이면 리더 탭 숨김, 리더 전용이면 개인 탭 숨김
  const showLeaderFeed = challengeType !== "personal_only";
  const showPersonalFeed = challengeType !== "leader_only";
  const isActive = (() => {
    // 표시용 상태는 effectiveLifecycle 우선 (워커 전이 지연 흡수 — docs/time-policy.md R4)
    const lc = challengeData?.effectiveLifecycle || challengeData?.lifecycle;
    if (lc === "active") return true;
    if (lc === "preparing" && !challengeData?.requireStartConfirmation && challengeData?.challengeStartAt) {
      return challengeData.challengeStartAt <= new Date().toISOString();
    }
    return false;
  })();
  const isLeader = challengeData?.leaderId === user?.userId;
  // 종료(완료/보관) 여부 — '시작 전(not active)'과 구분해야 안내 문구가 올바르다
  const lifecycleNow = challengeData?.effectiveLifecycle || challengeData?.lifecycle;
  const challengeEnded = lifecycleNow === "completed" || lifecycleNow === "archived";
  // 리더 운영 탭 노출 조건 — 챌린지 생성자 본인 (PRODUCT_SPEC §4.12-A)
  const isCreator = Boolean(challengeData?.createdBy) && challengeData?.createdBy === user?.userId;
  const isGaveUp = userChallenge?.phase === "gave_up" || userChallenge?.status === "gave_up";
  const canGiveUp = Boolean(userChallenge) && !isLeader && !isGaveUp && isActive;
  // 채팅방 노출 — 준비중(모집중/준비기간) 챌린지의 참여자 전용 (서버 $connect가 최종 검증).
  const isPreparing = (() => {
    const lc = challengeData?.effectiveLifecycle || challengeData?.lifecycle;
    return lc === "preparing" || lc === "recruiting";
  })();
  const canChat = isPreparing && Boolean(userChallenge) && !isGaveUp;

  // 퀘스트 진행 현황 계산
  const durationDays = challengeData?.durationDays || userChallenge?.durationDays || userChallenge?.challenge?.durationDays || 7;
  // 시작 전에는 '오늘' 개념이 없다 — todayDay=-1 로 두어 완료/오늘 하이라이트가 뜨지 않게 한다
  const todayDay = userChallenge && isActive ? computeTodayChallengeDay(userChallenge) : -1;
  const progressList: any[] = userChallenge?.progress || [];

  const isTodayAllDone = isMixedChallengeType
    ? allLeaderQuestsDoneToday && (personalQuest === null || iDidTodayPersonalQuestVerification)
    : leaderQuests.length > 0
      ? allLeaderQuestsDoneToday
      : iDidTodayVerification;

  // 인증 카드 1장 렌더 (리더/개인 피드 아코디언에서 공통 사용)
  const renderVerificationCard = (item: any) => (
    <article key={item.verificationId} className="glass-card rounded-2xl">
      {/* 4:5 이미지 — 다중이면 슬라이드. 오버레이 배지 포함 */}
      {item.verificationType === "image" && (item.imageUrls?.length || item.imageUrl) && (
        <div className="relative rounded-t-2xl overflow-hidden">
          <ImageCarousel
            images={item.imageUrls?.length ? item.imageUrls : [item.imageUrl]}
            aspect="aspect-[4/5]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
          <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full pointer-events-none">
            <span>📸</span>
            <span>Day {item.day || "-"}</span>
          </div>
          {item.score > 0 && (
            <div className="absolute bottom-3 right-3 bg-primary-500/90 backdrop-blur-sm text-white text-[11px] font-bold px-2.5 py-1 rounded-full pointer-events-none">
              +{item.score}pt
            </div>
          )}
        </div>
      )}

      {/* 영상 */}
      {item.verificationType === "video" && item.videoUrl && (
        <FeedVideo src={resolveMediaUrl(item.videoUrl)} />
      )}

      <div className="p-4">
        {/* 유저 정보 헤더 */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
              {item.displayName?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">
                {item.displayName || "참여자"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[11px] font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-md border border-primary-100">
                  Day {item.day || "-"}
                </span>
              </div>
            </div>
          </div>
          {/* 이미지 타입이 아닐 때 점수 */}
          {item.verificationType !== "image" && item.score > 0 && (
            <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-full border border-primary-100 flex-shrink-0">
              +{item.score}pt
            </span>
          )}
        </div>

        {/* 인증 내용 */}
        {item.todayNote && (
          <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">{item.todayNote}</p>
        )}

        {/* 해시태그 — 본문 아래 노출 */}
        {item.hashtag && (
          <div className="mt-2">
            <span className="inline-block text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full border border-primary-100">
              #{item.hashtag}
            </span>
          </div>
        )}

        {/* 퀘스트 정보 — 제목 + 더보기(설명) */}
        <QuestInfoBlock title={item.questTitle} description={item.questDescription} questType={item.questType} />

        {/* 링크 */}
        {item.verificationType === "link" && item.linkUrl && (
          <div className="mt-2">
            <LinkPreviewCard url={item.linkUrl} />
          </div>
        )}

        {/* 영상 검증 오류/대기 */}
        {item.verificationType === "video" && item.mediaValidationStatus === "invalid" && (
          <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 space-y-2">
            <p>영상 검증에서 문제가 발견되었습니다. 다시 업로드 해주세요.</p>
            {item.isMine && (
              <button
                type="button"
                onClick={() => {
                  setOpenVideoPickerSignal((prev) => prev + 1);
                  toast("영상 다시 인증을 시작합니다.", { icon: "📹" });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="px-3 py-1 rounded-lg border border-red-300 bg-white text-red-700 font-medium"
              >
                영상 다시 인증하기
              </button>
            )}
          </div>
        )}
        {item.verificationType === "video" && item.mediaValidationStatus === "pending" && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
            영상 메타데이터 검증 진행중입니다.
          </p>
        )}

        {/* 하단: 타입 + 날짜 */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/50">
          <span className="text-[11px] text-gray-400">
            {item.verificationType === "image" ? "📸 사진" : item.verificationType === "video" ? "🎬 영상" : item.verificationType === "link" ? "🔗 링크" : "📝 텍스트"}
          </span>
          {item.createdAt && (
            <span className="text-[11px] text-gray-400">
              {new Date(item.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
            </span>
          )}
        </div>

        {/* 이모지 반응 */}
        <div className="mt-3 pt-3 border-t border-white/40">
          <VerificationReactions
            verificationId={item.verificationId}
            challengeId={challengeId!}
            canInteract={isActive && Boolean(userChallenge)}
          />
        </div>

        {/* 댓글 */}
        <div className="mt-2">
          {/* 피드 댓글은 리더 포함 항상 익명(일일 활동명). 리더 신원 댓글은 운영탭에서 */}
          <VerificationComments
            verificationId={item.verificationId}
            challengeId={challengeId!}
            canComment={isActive && Boolean(userChallenge) && !isGaveUp}
            challengeEnded={challengeEnded}
            notStartedYet={!isActive && !challengeEnded}
          />
        </div>

        {/* 리더 전용 — 인증 게시물 반려 (본인 게시물 제외) */}
        {isCreator && !item.isMine && (
          <div className="mt-2 pt-2 border-t border-white/40">
            {rejectingVfId === item.verificationId ? (
              <div className="space-y-2">
                <p className="text-[11px] text-rose-600 bg-rose-50 rounded-lg px-2 py-1.5">
                  이 인증을 반려하면 <b>피드·마당에서 숨겨지고</b> 해당 날짜 완료·점수가 해제돼요.
                  (참여자 본인 기록에는 남아요.)
                </p>
                <input
                  value={rejectVfReason}
                  onChange={(e) => setRejectVfReason(e.target.value)}
                  placeholder="반려 사유(선택)"
                  maxLength={500}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-rose-300"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={rejectVerificationMutation.isPending}
                    onClick={() => rejectVerificationMutation.mutate({ verificationId: item.verificationId, reason: rejectVfReason.trim() || undefined })}
                    className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white disabled:opacity-50"
                  >
                    반려 확정
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejectingVfId(null); setRejectVfReason(""); }}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setRejectingVfId(item.verificationId); setRejectVfReason(""); }}
                className="text-[11px] font-medium text-rose-500 hover:text-rose-700 transition-colors"
              >
                🚩 이 인증 반려
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );

  // 인증 피드 아코디언 섹션 (탭하면 펼침/접힘)
  const renderFeedSection = (
    kind: "leader" | "personal",
    list: any[],
    open: boolean,
    toggle: () => void,
  ) => (
    <div className="rounded-xl border border-gray-100 overflow-hidden bg-white/40">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3.5 py-3 hover:bg-white/60 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-800">
          {kind === "leader" ? "🎯 리더퀘스트" : "🌱 개인퀘스트"}
          {list.length > 0 && <span className="ml-1.5 text-xs text-gray-400">{list.length}</span>}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-4">
          {list.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {kind === "leader" ? "아직 올라온 리더퀘스트 인증이 없습니다." : "아직 올라온 개인퀘스트 인증이 없습니다."}
            </p>
          ) : (
            list.map(renderVerificationCard)
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto min-h-screen w-full max-w-3xl lg:max-w-6xl pb-20">

        {/* 헤더 — 챌린지 이름 + (리더)피드/운영 탭 + 중도 포기 */}
        <div className="sticky top-0 glass-header px-4 lg:px-6 py-4 flex items-center gap-3 z-10">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-0 truncate">
            {challengeData?.title || "챌린지"}
          </h1>
          {/* 리더 DM — 참여자가 리더에게 1:1 문의 (상단 이동) */}
          {userChallenge && (
            <button
              type="button"
              onClick={() => leaderDmMutation.mutate()}
              disabled={leaderDmMutation.isPending}
              aria-label="리더 DM"
              title="리더에게 DM 보내기"
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              <span className="leading-none">💬</span>
              <span className="hidden sm:inline">{leaderDmMutation.isPending ? "연결중..." : "리더 DM"}</span>
            </button>
          )}
          {isCreator && (
            <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg flex-shrink-0">
              <button
                type="button"
                onClick={() => setMainTab("feed")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mainTab === "feed" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                피드
              </button>
              <button
                type="button"
                onClick={() => setMainTab("ops")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mainTab === "ops" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                👑 운영
              </button>
            </div>
          )}
          {canGiveUp && (
            <button
              type="button"
              onClick={() => {
                setGiveUpStep(1);
                setShowGiveUpConfirm(true);
              }}
              aria-label="중도 포기"
              title="중도 포기"
              className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 text-base hover:bg-red-50 hover:border-red-200 transition-colors"
            >
              🏳️
            </button>
          )}
        </div>

        {/* 중도 포기 확인 모달 — 3단계 확인 (리더/참여자 분기) */}
        {showGiveUpConfirm && (() => {
          const steps = isLeader
            ? [
                { title: '정말 포기하시겠어요?', body: '리더로서 이 챌린지를 포기하려고 해요. 이 작업은 되돌릴 수 없어요.' },
                { title: '한 번 더 확인할게요', body: '포기하면 리더로서의 운영·진행 기록이 사라지고 복구할 수 없어요.' },
                { title: '마지막 확인이에요', body: '이 결정은 취소할 수 없습니다. 정말 포기할까요?' },
              ]
            : [
                { title: '정말 포기하시겠어요?', body: '중도 포기는 되돌릴 수 없어요.' },
                { title: '한 번 더 확인할게요', body: '포기하면 더 이상 인증을 올릴 수 없어요. 다른 참여자의 피드는 계속 볼 수 있어요.' },
                { title: '마지막 확인이에요', body: '이 작업은 취소할 수 없습니다. 포기 시 ‘포기는쉽다’ 뱃지가 지급돼요.' },
              ];
          const step = steps[giveUpStep - 1];
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
              onClick={() => setShowGiveUpConfirm(false)}
            >
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="text-center mb-3">
                  <span className="text-3xl">🏳️</span>
                  <p className="text-xs text-gray-400 mt-1">{giveUpStep} / 3</p>
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-2 text-center">{step.title}</h2>
                <p className="text-sm text-gray-600 mb-4 text-center leading-relaxed">{step.body}</p>
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
                    onClick={() => {
                      if (giveUpStep < 3) setGiveUpStep(giveUpStep + 1);
                      else giveUpMutation.mutate();
                    }}
                    disabled={giveUpMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm disabled:opacity-50"
                  >
                    {giveUpMutation.isPending ? '처리 중...' : giveUpStep < 3 ? '계속' : '포기하기'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 응원 기록 바텀시트 (🕯️) */}
        {showCheerSheet && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
            onClick={() => setShowCheerSheet(false)}
          >
            <div
              className="flex max-h-[70vh] w-full max-w-md flex-col rounded-t-3xl bg-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-gray-300" />
              </div>
              <div className="flex items-center gap-1.5 px-5 pt-1 pb-2">
                <span className="text-lg">🕯️</span>
                <h3 className="text-base font-bold text-gray-900">응원 기록</h3>
              </div>
              <div className="flex gap-5 border-b border-gray-100 px-5">
                {(["received", "sent"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCheerSheetTab(t)}
                    className={`relative pb-2 text-sm ${cheerSheetTab === t ? "font-semibold text-gray-900" : "text-gray-400"}`}
                  >
                    {t === "received" ? "받은 응원" : "보낸 응원"}
                    {cheerSheetTab === t && <div className="absolute inset-x-0 -bottom-px h-0.5 bg-gray-900" />}
                  </button>
                ))}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
                {cheerRecords.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">
                    {cheerSheetTab === "received" ? "아직 받은 응원이 없어요" : "아직 보낸 응원이 없어요"}
                  </p>
                ) : (
                  cheerRecords.map((cheer: any, i: number) => (
                    <div key={cheer.cheerId ?? i} className="rounded-xl bg-gray-50 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          {cheer.senderAlias || cheer.receiverAlias || "익명의 응원자"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {cheer.createdAt ? String(cheer.createdAt).slice(5, 10) : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {cheer.message ||
                          (cheer.delta ? `${cheer.delta}분 일찍 인증하고 응원을 보냈어요 💪` : "응원을 보냈어요 💪")}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-gray-100 p-4">
                <button
                  type="button"
                  onClick={() => setShowCheerSheet(false)}
                  className="w-full rounded-xl bg-gray-100 py-2.5 text-sm font-medium text-gray-700"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {isCreator && mainTab === "ops" ? (
          <div className="p-4 lg:p-6 mx-auto w-full max-w-2xl">
            <LeaderOpsTab challengeId={challengeId} />
          </div>
        ) : (
        <div className="p-4 lg:p-6">
          <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-6 lg:items-start">

          {/* ── Left Sidebar ── */}
          <div className="space-y-4 lg:sticky lg:top-20">

          {/* 1) 카테고리 + 설명(좌) · 참여자/완료율 미니 카드(우) — 배경 없음 */}
          <section className="px-1 pt-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {challengeData?.category && (
                  <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {SLUG_TO_LABEL[challengeData.category] ?? challengeData.category}
                  </span>
                )}
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  {challengeData?.description || "챌린지 소개를 불러오지 못했습니다."}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex flex-col items-center justify-center">
                  <p className="text-lg font-bold text-gray-800 leading-none">
                    {challengeData?.stats?.totalParticipants || challengeData?.participantCount || 0}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">참여자</p>
                </div>
                <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 flex flex-col items-center justify-center">
                  <p className="text-lg font-bold text-gray-800 leading-none">
                    {challengeData?.stats?.completionRate || 0}%
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">완료율</p>
                </div>
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
                {canCheerNow ? "피드에서 다른 참여자들의 인증 게시물에 리액션과 댓글로 서로 힘을 나눠주세요." : "오늘 인증 후 응원 기능이 열립니다."}
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

          {/* 2) 챌린지 보드 안내 — 인라인 아코디언 확장 + 📌 고정 (전체보기 페이지는 확장 영역 내 링크로 유지) */}
          <BoardGuideSection challengeId={challengeId} />

          {/* 개인 퀘스트 제안 섹션 */}
          {challengeData?.personalQuestEnabled && (() => {
            const proposal = myProposalData?.latestProposal ?? null;
            const lifecycle = (challengeData?.effectiveLifecycle || challengeData?.lifecycle) as string;
            const canSubmit = ["recruiting", "preparing"].includes(lifecycle);
            // 상태는 v1 3종(pending/approved/rejected) — challenge-api PORTING.md §7-e
            const statusLabel: Record<string, string> = {
              pending: "⏳ 심사 중",
              approved: "✅ 승인됨",
              rejected: "↩️ 반려됨",
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
                        : proposal.status === "rejected" ? "bg-red-100 text-red-700"
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
                          setProposalForm({ title: proposal.title, description: proposal.description || "" });
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
                            setProposalForm({ title: "", description: "" });
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
                      {myProposalData?.latestProposal?.status === "pending"
                        ? "⏳ 개인 퀘스트 승인 대기 중입니다."
                        : "개인 퀘스트가 없습니다. 제안 섹션에서 제출해주세요."}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 채팅방 — 준비중 챌린지 참여자 전용 (오늘의 인증 바로 위) */}
          {challengeId && canChat && <ChallengeChatPanel challengeId={challengeId} />}

          {/* 퀘스트 없을 때 일반 인증 폼 — 챌린지 시작 후에만 노출 */}
          {isActive &&
            (!questsData || questsData.length === 0 || (challengeType === "leader_only" && leaderQuests.length === 0)) &&
            (!iDidTodayVerification || hasInvalidMyVideo) &&
            userChallenge &&
            !isGaveUp && (
              <section className="glass-card rounded-2xl p-5">
                <h3 className="font-bold text-gray-900 mb-3">오늘의 인증</h3>
                <InlineVerificationForm
                  userChallenge={userChallenge}
                  allowedVerificationTypes={challengeData?.allowedVerificationTypes}
                  personalQuestPending={
                    Boolean(challengeData?.personalQuestEnabled) &&
                    ["pending", "revision_pending"].includes(
                      String(myProposalData?.latestProposal?.status ?? ""),
                    )
                  }
                  onSuccess={handleVerificationSuccess}
                  openVideoPickerSignal={openVideoPickerSignal}
                />
              </section>
            )}

          {/* 인증 완료 메시지 — 챌린지 시작 후에만 */}
          {isActive && isTodayAllDone && !hasInvalidMyVideo && (
            <section className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 shadow-sm">
              <h3 className="font-bold text-emerald-800">✅ 오늘 인증 완료!</h3>
              <p className="text-sm text-emerald-700 mt-1">이제 피드에서 리액션과 댓글로 서로 힘을 나눠줄 수 있어요.</p>
            </section>
          )}

          {/* 5) 인증 피드 — 챌린지 유형에 맞는 섹션만, 각 섹션 펼침/접힘(아코디언) */}
          <section className="glass-card rounded-2xl p-5">
            <h3 className="font-bold text-gray-900 mb-3">인증 피드</h3>
            <div className="space-y-3">
              {showLeaderFeed && renderFeedSection("leader", leaderFeedVerifications, openLeaderFeed, () => setOpenLeaderFeed((v) => !v))}
              {showPersonalFeed && renderFeedSection("personal", personalFeedVerifications, openPersonalFeed, () => setOpenPersonalFeed((v) => !v))}
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

          {/* 8) 통합 스탯 5칸(오늘 인증/전체 참여자/총 인증/연속/🕯️응원기록) — mobile only */}
          <section className="lg:hidden glass-card rounded-2xl p-3">
            <div className="grid grid-cols-5 gap-1 text-center">
              <div className="py-1.5">
                <p className="text-base font-bold text-gray-900 leading-none">{todayCompletedCount}</p>
                <p className="mt-1 text-[10px] text-gray-400">오늘 인증</p>
              </div>
              <div className="py-1.5">
                <p className="text-base font-bold text-gray-900 leading-none">
                  {challengeData?.stats?.totalParticipants || challengeData?.participantCount || 0}
                </p>
                <p className="mt-1 text-[10px] text-gray-400">전체 참여자</p>
              </div>
              <div className="py-1.5">
                <p className="text-base font-bold text-gray-900 leading-none">{myTotalCount}</p>
                <p className="mt-1 text-[10px] text-gray-400">총 인증</p>
              </div>
              <div className="py-1.5">
                <p className="text-base font-bold text-gray-900 leading-none">
                  {userChallenge?.consecutiveDays ?? 0}
                </p>
                <p className="mt-1 text-[10px] text-gray-400">연속</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCheerSheet(true)}
                aria-label="응원 기록"
                className="flex flex-col items-center justify-center rounded-lg py-1.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-lg leading-none">🕯️</span>
                <p className="mt-1 text-[10px] text-gray-400">응원 기록</p>
              </button>
            </div>
          </section>

          {/* 리액션·댓글 안내 배너 — mobile only */}
          <div className="lg:hidden rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-700">
            피드에서 다른 참여자들의 인증 게시물에 리액션과 댓글로 서로 힘을 나눠주세요.
          </div>

          {/* 9) 보완 인증 — 맨 아래 */}
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

          </div>{/* ── End Right Main ── */}
          </div>{/* ── End Grid ── */}
        </div>
        )}
      </div>
    </div>
  );
};
