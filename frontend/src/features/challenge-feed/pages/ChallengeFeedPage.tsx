import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiArrowLeft } from "react-icons/fi";
import toast from "react-hot-toast";
import { apiClient } from "@/lib/api-client";
import { Loading } from "@/shared/components/Loading";
import { InlineVerificationForm } from "@/features/verification/components/InlineVerificationForm";
import { QuestSubmitSheet } from "@/features/quest/components/QuestSubmitSheet";
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
            playPromise.catch(() => {
              // autoplay can fail on some mobile settings (low power mode etc.)
            });
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
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kst.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return toKstKey(d) === toKstKey(now);
}

export const ChallengeFeedPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      const response = await apiClient.get("/challenges/my?status=active");
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

  const { data: verificationData, isLoading: isVerificationsLoading } =
    useQuery({
      queryKey: ["challenge-feed-verifications", challengeId],
      enabled: Boolean(challengeId),
      queryFn: async () => {
        const response = await apiClient.get(
          `/verifications?isPublic=true&limit=50&challengeId=${challengeId}`,
        );
        return response.data?.data?.verifications || [];
      },
    });

  const { data: myVerificationData, isLoading: isMyVerificationsLoading } =
    useQuery({
      queryKey: ["challenge-feed-my-verifications", challengeId],
      enabled: Boolean(challengeId),
      queryFn: async () => {
        const response = await apiClient.get(
          `/verifications?mine=true&limit=50&challengeId=${challengeId}`,
        );
        return response.data?.data?.verifications || [];
      },
    });

  const { data: personalQuestData } = useQuery({
    queryKey: ["challenge-personal-quests", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/quests?challengeId=${challengeId}&status=active`);
      const quests: any[] = res.data?.data?.quests ?? [];
      return quests.find((q: any) => q.questScope === 'personal') ?? null;
    },
  });

  const { data: myProposalData, refetch: refetchMyProposal } = useQuery({
    queryKey: ["challenge-my-proposal", challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/challenges/${challengeId}/personal-quest`);
      return res.data?.data ?? { latestProposal: null, proposals: [] };
    },
  });

  const [selectedPersonalQuest, setSelectedPersonalQuest] = useState<any>(null);
  const [isProposalFormOpen, setIsProposalFormOpen] = useState(false);
  const [proposalForm, setProposalForm] = useState({ title: '', description: '', allowedVerificationTypes: ['image', 'text', 'link', 'video'] as string[] });

  const submitProposalMutation = useMutation({
    mutationFn: async () => {
      const uc = userChallenge;
      const userChallengeId = uc?.userChallengeId ?? uc?.id;
      if (!userChallengeId) throw new Error('참여 정보를 찾을 수 없습니다');
      await apiClient.post(`/challenges/${challengeId}/personal-quest`, {
        userChallengeId,
        title: proposalForm.title.trim(),
        description: proposalForm.description.trim(),
        allowedVerificationTypes: proposalForm.allowedVerificationTypes,
      });
    },
    onSuccess: () => {
      toast.success('개인 퀘스트 제안이 제출됐어요 🎯');
      setIsProposalFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["challenge-my-proposal", challengeId] });
      queryClient.invalidateQueries({ queryKey: ["challenge-personal-quests", challengeId] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || '제안 제출에 실패했습니다');
    },
  });

  const leaderDmMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(
        `/challenge-feed/${challengeId}/leader-dm`,
      );
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
      toast.success(
        threadId ? "리더 DM 연결 완료 (threadId 복사됨)" : "리더 DM 연결 완료",
      );
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || "리더 DM 연결에 실패했습니다",
      );
    },
  });

  const boardSummary = useMemo(() => {
    const blocks = boardData?.blocks || [];
    const textBlock = blocks.find((b: any) => b.type === "text" && b.content);
    return {
      blockCount: blocks.length,
      summary:
        textBlock?.content || "아직 챌린지 보드 안내가 등록되지 않았습니다.",
    };
  }, [boardData]);

  // API에서 이미 challengeId 필터링됨 - 추가 클라이언트 필터 불필요
  const challengeVerifications = useMemo(
    () => verificationData || [],
    [verificationData],
  );

  const myChallengeVerifications = useMemo(
    () => myVerificationData || [],
    [myVerificationData],
  );

  const todayCompletedCount = useMemo(
    () =>
      challengeVerifications.filter((item: any) =>
        isSameKstDate(item.performedAt || item.createdAt),
      ).length,
    [challengeVerifications],
  );

  const iDidTodayVerification = useMemo(
    () =>
      myChallengeVerifications.some((item: any) =>
        isSameKstDate(item.performedAt || item.createdAt),
      ),
    [myChallengeVerifications],
  );

  const myTotalCount = myChallengeVerifications.length;
  const canCheerNow = iDidTodayVerification;
  const [openVideoPickerSignal, setOpenVideoPickerSignal] = useState(0);

  const hasInvalidMyVideo = useMemo(
    () =>
      myChallengeVerifications.some(
        (item: any) =>
          item.verificationType === "video" &&
          item.mediaValidationStatus === "invalid",
      ),
    [myChallengeVerifications],
  );
  const hasPendingVideoValidation = useMemo(
    () =>
      [...challengeVerifications, ...myChallengeVerifications].some(
        (item: any) =>
          item.verificationType === "video" &&
          item.mediaValidationStatus === "pending",
      ),
    [challengeVerifications, myChallengeVerifications],
  );

  useEffect(() => {
    if (!hasPendingVideoValidation || !challengeId) return;

    const timer = window.setInterval(() => {
      queryClient.invalidateQueries({
        queryKey: ["challenge-feed-verifications", challengeId],
      });
      queryClient.invalidateQueries({
        queryKey: ["challenge-feed-my-verifications", challengeId],
      });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [hasPendingVideoValidation, challengeId, queryClient]);

  if (!challengeId) {
    return (
      <div className="p-6 text-sm text-gray-500">challengeId가 필요합니다.</div>
    );
  }

  if (
    isChallengeLoading ||
    isBoardLoading ||
    isVerificationsLoading ||
    isMyVerificationsLoading
  ) {
    return <Loading fullScreen />;
  }

  const challengeType = challengeData?.challengeType || 'leader_personal';
  const isMixedChallengeType = challengeType === 'leader_personal' || challengeType === 'mixed';
  const questBoardLabel = challengeType === 'leader_only' ? '리더 퀘스트 📋'
    : challengeType === 'personal_only' ? '개인 퀘스트 📋' : '퀘스트 보드 📋';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto min-h-screen w-full max-w-3xl bg-gray-50 pb-20 md:border-x md:border-gray-200">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 z-10">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">챌린지 피드</h1>
        </div>

        <div className="p-6 space-y-4">
          <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">
              {challengeData?.title || "챌린지"}
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              {challengeData?.description ||
                "챌린지 소개를 불러오지 못했습니다."}
            </p>
          </section>

          <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-900">챌린지 보드 요약</h3>
              <span className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                블록 {boardSummary.blockCount}개
              </span>
            </div>
            <p className="text-sm text-gray-700 line-clamp-3">
              {boardSummary.summary}
            </p>
            <div className="mt-3 flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate(`/challenge-board/${challengeId}`)}
                className="text-xs font-semibold text-primary-700"
              >
                보드 전체 보기 →
              </button>
              <button
                type="button"
                onClick={() => navigate(`/quests?challengeId=${challengeId}`)}
                className="text-xs font-semibold text-amber-700"
              >
                {questBoardLabel}
              </button>
              {isMixedChallengeType && (
                <p className="text-xs text-gray-500 mt-1">리더퀘스트 + 개인퀘스트 모두 인증해야 하루 완료</p>
              )}
            </div>
          </section>

          {/* 개인 퀘스트 제안 섹션 - personalQuestEnabled인 모든 챌린지에 표시 */}
          {challengeData?.personalQuestEnabled && (() => {
            const proposal = myProposalData?.latestProposal ?? null;
            const lifecycle = challengeData?.lifecycle as string;
            const canSubmit = ['recruiting', 'preparing'].includes(lifecycle);
            const statusLabel: Record<string, string> = {
              pending: '⏳ 심사 중',
              revision_pending: '⏳ 재심사 중',
              approved: '✅ 승인됨',
              rejected: '↩️ 반려됨',
              expired: '⛔ 만료됨',
            };
            return (
              <section className="bg-amber-50 rounded-2xl p-5 border border-amber-100 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-amber-900">📋 나의 개인 퀘스트 제안</h3>
                  {challengeType !== 'personal_only' && (
                    <button type="button" onClick={() => navigate(`/quests?challengeId=${challengeId}`)} className="text-xs font-semibold text-amber-700 underline">
                      퀘스트 보드 →
                    </button>
                  )}
                </div>

                {proposal ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        proposal.status === 'approved' ? 'bg-green-100 text-green-700'
                        : proposal.status === 'rejected' || proposal.status === 'expired' ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
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
                          setProposalForm({ title: proposal.title, description: proposal.description || '', allowedVerificationTypes: proposal.allowedVerificationTypes ?? ['image', 'text', 'link', 'video'] });
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
                            setProposalForm({ title: '', description: '', allowedVerificationTypes: challengeData?.allowedVerificationTypes ?? ['image', 'text', 'link', 'video'] });
                            setIsProposalFormOpen(true);
                          }}
                          className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold"
                        >
                          개인 퀘스트 제안하기 🎯
                        </button>
                      </>
                    ) : (
                      <p className="text-sm text-amber-700">
                        {lifecycle === 'active' ? '챌린지가 시작됐어요. 개인 퀘스트 제안 마감이 지났습니다.' : '개인 퀘스트 제안 기간이 아닙니다.'}
                      </p>
                    )}
                  </div>
                )}

                {/* active 상태에서 승인된 퀘스트가 있으면 기존 제출 버튼 유지 */}
                {lifecycle === 'active' && personalQuestData && !personalQuestData.mySubmission && (
                  <button
                    type="button"
                    onClick={() => setSelectedPersonalQuest(personalQuestData)}
                    className="mt-3 px-4 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-semibold"
                  >
                    개인 퀘스트 인증 제출하기 →
                  </button>
                )}
              </section>
            );
          })()}

          {/* 개인 퀘스트 제안 제출/수정 폼 */}
          <BottomSheet isOpen={isProposalFormOpen} onClose={() => setIsProposalFormOpen(false)} title="개인 퀘스트 제안">
            <div className="px-6 pb-8 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">퀘스트 제목 <span className="text-red-500">*</span></label>
                <input
                  value={proposalForm.title}
                  maxLength={100}
                  onChange={e => setProposalForm(p => ({ ...p, title: e.target.value }))}
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
                  onChange={e => setProposalForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="어떻게 실천할지 구체적으로 적어주세요"
                  className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-xl text-sm resize-none"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">허용 인증 방식</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['image', 'text', 'link', 'video'] as const).map(vt => {
                    const label = vt === 'image' ? '📸 사진' : vt === 'text' ? '✍️ 텍스트' : vt === 'link' ? '🔗 링크' : '🎥 영상';
                    const isChecked = proposalForm.allowedVerificationTypes.includes(vt);
                    return (
                      <button
                        key={vt}
                        type="button"
                        onClick={() => setProposalForm(p => {
                          const next = isChecked ? p.allowedVerificationTypes.filter(t => t !== vt) : [...p.allowedVerificationTypes, vt];
                          return { ...p, allowedVerificationTypes: next.length > 0 ? next : p.allowedVerificationTypes };
                        })}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm ${isChecked ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                      >
                        {isChecked ? '✓' : '○'} {label}
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
                {submitProposalMutation.isPending ? '제출 중...' : '제안 제출하기 🚀'}
              </button>
            </div>
          </BottomSheet>

          {(!iDidTodayVerification || hasInvalidMyVideo) && userChallenge && (
            <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">
                {challengeType === 'personal_only' ? '개인 퀘스트 인증 📸' : '오늘의 인증'}
              </h3>
              <InlineVerificationForm
                userChallenge={userChallenge}
                allowedVerificationTypes={
                  challengeData?.allowedVerificationTypes
                }
                onSuccess={() => {
                  queryClient.invalidateQueries({
                    queryKey: ["challenge-feed-verifications", challengeId],
                  });
                  queryClient.invalidateQueries({
                    queryKey: ["challenge-feed-my-verifications", challengeId],
                  });
                }}
                openVideoPickerSignal={openVideoPickerSignal}
              />
            </section>
          )}

          {/* 개인 퀘스트 제출 시트 */}
          <QuestSubmitSheet
            isOpen={!!selectedPersonalQuest}
            onClose={() => setSelectedPersonalQuest(null)}
            quest={selectedPersonalQuest}
          />

          {iDidTodayVerification && !hasInvalidMyVideo && (
            <section className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100 shadow-sm">
              <h3 className="font-bold text-emerald-800">✅ 오늘 인증 완료!</h3>
              <p className="text-sm text-emerald-700 mt-1">
                이제 다른 참여자를 응원할 수 있어요.
              </p>
            </section>
          )}

          {(() => {
            if (!userChallenge) return null;
            const remedyType = getRemedyType(userChallenge.remedyPolicy);
            if (remedyType === "strict") return null;
            const remaining = getRemainingRemedyCount(
              userChallenge.remedyPolicy,
              userChallenge.progress || [],
            );
            const failedDays = (userChallenge.progress || []).filter(
              (p: any) => p.day <= 5 && p.status !== "success" && !p.remedied,
            );
            const canRemedy =
              (remaining === null || remaining > 0) && failedDays.length > 0;
            return (
              <section className="bg-white rounded-2xl p-5 border border-purple-100 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-2">보완 인증</h3>
                <p className="text-xs text-gray-500 mb-3">
                  실패한 Day는 보완 인증(70% 점수)으로 연결할 수 있어요. · 남은
                  보완 {remaining === null ? "제한 없음" : `${remaining}회`}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/verification/remedy?userChallengeId=${userChallenge.userChallengeId}`,
                    )
                  }
                  disabled={!canRemedy}
                  className="w-full py-2.5 rounded-xl border border-purple-200 text-purple-700 bg-purple-50 disabled:opacity-40 text-sm font-medium hover:bg-purple-100 transition-colors"
                >
                  보완하기{" "}
                  {remaining === null ? "(제한 없음)" : `(${remaining}회 남음)`}
                </button>
              </section>
            );
          })()}

          <section className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500">오늘 인증 완료 인원</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {todayCompletedCount}명
              </p>
              <p className="text-xs text-gray-500">KST 기준</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500">전체 참여자</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {challengeData?.stats?.totalParticipants ||
                  challengeData?.participantCount ||
                  0}
                명
              </p>
              <p className="text-xs text-gray-500">챌린지 누적</p>
            </div>
          </section>

          <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-2">
              내 응원권/기록 현황
            </h3>
            <p className="text-sm text-gray-700">
              기간 내 내 인증 기록:{" "}
              <span className="font-semibold">{myTotalCount}회</span>
            </p>
            <p className="text-sm text-gray-700 mt-1">
              {canCheerNow
                ? "응원권을 사용할 수 있어요. 피드에서 응원해보세요!"
                : "인증 후 응원권 기능이 열립니다."}
            </p>
          </section>

          <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">인증 피드</h3>
            <div className="space-y-3">
              {challengeVerifications.map((item: any) => (
                <article
                  key={item.verificationId}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500">
                      {item.isAnonymous
                        ? "익명 참여자"
                        : item.userName || "참여자"}
                    </p>
                    <p className="text-xs text-gray-400">
                      Day {item.day || "-"}
                    </p>
                  </div>
                  {item.todayNote && (
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {item.todayNote}
                    </p>
                  )}
                  {item.verificationType === "video" &&
                    item.mediaValidationStatus === "invalid" && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-2 space-y-2">
                        <p>
                          영상 검증에서 문제가 발견되었습니다. 다시 업로드
                          해주세요.
                        </p>
                        {item.userId === userChallenge?.userId && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenVideoPickerSignal((prev) => prev + 1);
                              toast("영상 다시 인증을 시작합니다.", {
                                icon: "📹",
                              });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="px-2 py-1 rounded border border-red-300 bg-white text-red-700"
                          >
                            영상 다시 인증하기
                          </button>
                        )}
                      </div>
                    )}
                  {item.verificationType === "video" &&
                    item.mediaValidationStatus === "pending" && (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                        영상 메타데이터 검증 진행중입니다.
                      </p>
                    )}
                  {item.verificationType === "image" && item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt="verification"
                      className="mt-2 w-full rounded-lg border border-gray-100"
                    />
                  )}
                  {item.verificationType === "video" && item.videoUrl && (
                    <FeedVideo src={item.videoUrl} />
                  )}
                  {item.verificationType === "link" && item.linkUrl && (
                    <LinkPreviewCard url={item.linkUrl} />
                  )}
                </article>
              ))}
              {challengeVerifications.length === 0 && (
                <p className="text-sm text-gray-500">
                  아직 올라온 인증 게시물이 없습니다.
                </p>
              )}
            </div>
          </section>

          <button
            type="button"
            onClick={() => leaderDmMutation.mutate()}
            disabled={leaderDmMutation.isPending}
            className="w-full py-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-semibold disabled:opacity-50"
          >
            {leaderDmMutation.isPending ? "DM 연결중..." : "리더 DM"}
          </button>
        </div>
      </div>
    </div>
  );
};
