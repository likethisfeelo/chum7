import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { challengeApi } from "@/features/challenge/api/challengeApi";
import { resolveMediaUrl } from "@/shared/utils/mediaUrl";

/**
 * 참여자용 '관리' 탭 — 날짜별 내 인증 게시물 전체를 식별 가능하게(썸네일·내용·인증시간) 보여주고,
 * 게시물 단위로 행동한다:
 *  - 인정 요청: 자동 인정이 안 잡힌 날의 게시물로 'N일차 인증 인정' 요청 (메시지 첨부 가능)
 *  - 인증 취소: 잘못 카운트된 게시물의 그날 완료·점수 해제 (페이지의 취소 모달 재사용)
 *  - 리더 DM: 그 외 카운트 오류 등 문의
 */
const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "대기중", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "승인됨", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "반려됨", cls: "bg-rose-50 text-rose-600 border-rose-200" },
};

function typeIcon(t?: string): string {
  return t === "image" ? "📸" : t === "video" ? "🎬" : t === "link" ? "🔗" : "📝";
}

const fmtTime = (iso?: string | null): string => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

export function ParticipantRequestsTab({
  challengeId,
  myVerifications,
  canRequest,
  onLeaderDm,
  dmPending,
  hasLeaderDm,
  completedDays,
  canCancel,
  onCancelVerification,
}: {
  challengeId: string;
  myVerifications: any[];
  canRequest: boolean;
  onLeaderDm: () => void;
  dmPending: boolean;
  hasLeaderDm: boolean;
  /** 이미 완료(자동 인정)된 일자 — 이 날짜 게시물엔 '인정 요청' 버튼을 띄우지 않는다 */
  completedDays: Set<number>;
  /** 인증 취소 가능 여부 (완주/포기 후엔 불가) */
  canCancel?: boolean;
  /** 게시물 인증 취소 — 페이지의 2중 확인 취소 모달을 연다 */
  onCancelVerification?: (verificationId: string, day: number) => void;
}) {
  const queryClient = useQueryClient();

  const { data: myRequests = [], isLoading } = useQuery({
    queryKey: ["my-completion-requests", challengeId],
    enabled: Boolean(challengeId),
    queryFn: () => challengeApi.getMyCompletionRequests(challengeId),
  });

  // verificationId → 최신 요청 상태 (중복 요청 방지 표시)
  const requestByVerification = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of myRequests) {
      const vid = String(r.verificationId ?? "");
      if (vid && !map.has(vid)) map.set(vid, String(r.status ?? "pending"));
    }
    return map;
  }, [myRequests]);

  // 오늘의 인증 교체 — 추가 기록을 그날의 대표 인증으로 승격 (기존 대표는 추가 기록으로)
  const makeTodayMutation = useMutation({
    mutationFn: (verificationId: string) => challengeApi.makeTodayVerification(verificationId),
    onSuccess: () => {
      toast.success("오늘의 인증을 이 게시물로 변경했어요. 기존 게시물은 '추가 기록'으로 남아요.");
      queryClient.invalidateQueries({ queryKey: ["challenge-feed-my-verifications", challengeId] });
      queryClient.invalidateQueries({ queryKey: ["challenge-feed-verifications", challengeId] });
      queryClient.invalidateQueries({ queryKey: ["my-challenges"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "변경에 실패했어요"),
  });

  const requestMutation = useMutation({
    mutationFn: (vars: { verificationId: string; day: number; message?: string }) =>
      challengeApi.requestCompletion(challengeId, {
        verificationId: vars.verificationId,
        day: vars.day,
        ...(vars.message ? { message: vars.message } : {}),
      }),
    onSuccess: () => {
      toast.success("리더에게 인정 요청을 보냈어요");
      queryClient.invalidateQueries({ queryKey: ["my-completion-requests", challengeId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "요청에 실패했어요"),
  });

  // 날짜별 게시물 전체 — 숨기지 않고 모두 보여준다(식별 가능해야 요청/취소 대상 선택 가능)
  const postsByDay = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const v of myVerifications) {
      const day = Number(v.day ?? 0);
      const list = map.get(day) ?? [];
      list.push(v);
      map.set(day, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [myVerifications]);

  const startRequest = (v: any) => {
    const message = window.prompt(
      `${v.day}일차 인증 인정을 요청해요.\n리더에게 전할 메시지 (선택 — 카운트 오류 등 상황 설명)`,
      "",
    );
    if (message === null) return;
    requestMutation.mutate({ verificationId: v.verificationId, day: v.day, message: message.trim() || undefined });
  };

  return (
    <div className="p-4 lg:p-6 mx-auto w-full max-w-2xl space-y-4">
      {/* 안내 */}
      <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
        <p className="text-sm font-semibold text-indigo-800">🗂 내 인증 게시물 관리</p>
        <p className="text-xs text-indigo-600/90 mt-1 leading-relaxed">
          날짜별 내 게시물을 확인하고, <b>자동 인정이 안 잡힌 날</b>은 그 게시물로 <b>인정 요청</b>을,
          <b> 잘못 카운트된 게시물</b>은 <b>인증 취소</b>를 할 수 있어요. 그 외 문제는 리더 DM으로 알려주세요.
        </p>
      </div>

      {/* 리더 DM */}
      {hasLeaderDm && (
        <button
          type="button"
          onClick={onLeaderDm}
          disabled={dmPending}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          💬 {dmPending ? "연결 중..." : "리더에게 DM 보내기"}
        </button>
      )}

      {/* 날짜별 내 게시물 */}
      <section>
        <h3 className="text-sm font-bold text-gray-800 mb-2 px-1">날짜별 내 게시물</h3>
        {myVerifications.length === 0 ? (
          <p className="text-xs text-gray-400 px-1 py-4">아직 올린 인증 게시물이 없어요. 먼저 인증을 올려주세요.</p>
        ) : (
          <div className="space-y-3">
            {postsByDay.map(([day, posts]) => {
              const dayDone = completedDays.has(day);
              return (
                <div key={day} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-700">Day {day || "-"}</p>
                    {dayDone ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">인증 완료된 날</span>
                    ) : (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">미인정</span>
                    )}
                    <span className="ml-auto text-[10px] text-gray-400">{posts.length}건</span>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {posts.map((v: any) => {
                      const reqStatus = requestByVerification.get(String(v.verificationId));
                      const canAskThis =
                        canRequest && !dayDone && !v.isExtra && !v.scoreCancelled && !reqStatus;
                      const canCancelThis =
                        Boolean(canCancel && onCancelVerification) && !v.isExtra && !v.scoreCancelled && dayDone;
                      return (
                        <li key={v.verificationId} className="flex items-start gap-3 p-3">
                          {v.imageUrl ? (
                            <img
                              src={resolveMediaUrl(v.imageUrl)}
                              alt=""
                              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">
                              {typeIcon(v.verificationType)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-semibold text-gray-700">
                                {typeIcon(v.verificationType)}
                                {v.questTitle ? ` ${v.questTitle}` : v.questType === "personal" ? " 개인 퀘스트" : " 인증"}
                              </p>
                              {v.isExtra && <span className="text-[9px] px-1 rounded bg-amber-50 text-amber-700 border border-amber-200">➕ 추가 기록</span>}
                              {v.scoreCancelled && <span className="text-[9px] px-1 rounded bg-gray-200 text-gray-500">취소됨</span>}
                              {v.rejectedByLeader && <span className="text-[9px] px-1 rounded bg-rose-100 text-rose-600">반려됨</span>}
                            </div>
                            {v.todayNote && <p className="text-xs text-gray-500 truncate mt-0.5">{v.todayNote}</p>}
                            <p className="text-[10px] text-gray-400 mt-0.5">인증시간 {fmtTime(v.performedAt || v.createdAt)}</p>
                            <div className="flex gap-1.5 mt-1.5 flex-wrap">
                              {reqStatus ? (
                                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${STATUS_META[reqStatus]?.cls ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                                  인정 요청 {STATUS_META[reqStatus]?.label ?? reqStatus}
                                </span>
                              ) : canAskThis ? (
                                <button
                                  type="button"
                                  disabled={requestMutation.isPending}
                                  onClick={() => startRequest(v)}
                                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  {v.day}일차 인정 요청
                                </button>
                              ) : null}
                              {canCancelThis && (
                                <button
                                  type="button"
                                  onClick={() => onCancelVerification!(v.verificationId, Number(v.day))}
                                  className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-rose-600 hover:border-rose-200"
                                >
                                  인증 취소
                                </button>
                              )}
                              {/* 추가 기록 — 오늘 몫은 이미 완료. 원하면 이 게시물로 대표 인증 교체 */}
                              {v.isExtra && !v.scoreCancelled && !v.rejectedByLeader && dayDone && canCancel && (
                                <button
                                  type="button"
                                  disabled={makeTodayMutation.isPending}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        "오늘의 인증을 이 게시물로 변경할까요?\n기존 인증 게시물은 '추가 기록'으로 바뀌고, 점수·연속일은 그대로예요.",
                                      )
                                    ) {
                                      makeTodayMutation.mutate(v.verificationId);
                                    }
                                  }}
                                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                                >
                                  오늘의 인증으로 변경
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {!canRequest && myVerifications.length > 0 && (
          <p className="text-[11px] text-gray-400 px-1 mt-2">※ 인정 요청은 챌린지 진행 중·완주 전에만 보낼 수 있어요.</p>
        )}
      </section>

      {/* 내 요청 현황 */}
      <section>
        <h3 className="text-sm font-bold text-gray-800 mb-2 px-1">내 요청 현황</h3>
        {isLoading ? (
          <p className="text-xs text-gray-400 px-1 py-4">불러오는 중…</p>
        ) : myRequests.length === 0 ? (
          <p className="text-xs text-gray-400 px-1 py-4">보낸 요청이 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {myRequests.map((r) => (
              <li
                key={r.requestId}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 bg-white"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-700">{r.day}일차 인정 요청</p>
                  {r.message && <p className="text-xs text-gray-500 truncate mt-0.5">내 메시지: {r.message}</p>}
                  {r.feedback && <p className="text-xs text-gray-500 truncate mt-0.5">리더: {r.feedback}</p>}
                  {r.createdAt && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(r.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                    </p>
                  )}
                </div>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border shrink-0 ${STATUS_META[r.status]?.cls ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                  {STATUS_META[r.status]?.label ?? r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
