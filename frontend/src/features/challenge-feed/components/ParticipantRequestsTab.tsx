import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { challengeApi } from "@/features/challenge/api/challengeApi";

/**
 * 참여자용 '요청' 탭 — 챌린지 피드의 피드/요청 분리 중 요청 쪽.
 *  - 리더 DM
 *  - 인정 요청 보내기: 내 게시물을 골라 'N일차 인증으로 인정' 요청 (자동 인증이 안 잡혔을 때만)
 *  - 내 요청 현황: 보낸 요청의 대기/승인/반려 상태
 * 인증 인정 요청 버튼을 카드마다 두던 것을 이 탭으로 모아, '올리면 자동인증'과 혼동/중복을 줄인다.
 */
const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "대기중", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "승인됨", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "반려됨", cls: "bg-rose-50 text-rose-600 border-rose-200" },
};

function typeIcon(t?: string): string {
  return t === "image" ? "📸" : t === "video" ? "🎬" : t === "link" ? "🔗" : "📝";
}

export function ParticipantRequestsTab({
  challengeId,
  myVerifications,
  canRequest,
  onLeaderDm,
  dmPending,
  hasLeaderDm,
  completedDays,
}: {
  challengeId: string;
  myVerifications: any[];
  canRequest: boolean;
  onLeaderDm: () => void;
  dmPending: boolean;
  hasLeaderDm: boolean;
  /** 이미 완료(자동 인정)된 일자 — 이 날짜 게시물엔 '인정 요청'을 띄우지 않는다 */
  completedDays: Set<number>;
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

  const requestMutation = useMutation({
    mutationFn: (vars: { verificationId: string; day: number }) =>
      challengeApi.requestCompletion(challengeId, { verificationId: vars.verificationId, day: vars.day }),
    onSuccess: () => {
      toast.success("리더에게 인정 요청을 보냈어요");
      queryClient.invalidateQueries({ queryKey: ["my-completion-requests", challengeId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || "요청에 실패했어요"),
  });

  // 추가(isExtra)·취소된 게시물, 그리고 '이미 완료(자동 인정)된 일자'의 게시물은 요청 대상에서 제외.
  //  자동으로 그날 완료된 날짜엔 '인정 요청'이 뜰 필요가 없다 (규칙상 자동 인정이 안 잡힌 날만 후보).
  const requestable = useMemo(
    () => myVerifications.filter((v) => !v.isExtra && !v.scoreCancelled && !completedDays.has(Number(v.day))),
    [myVerifications, completedDays],
  );

  return (
    <div className="p-4 lg:p-6 mx-auto w-full max-w-2xl space-y-4">
      {/* 안내 */}
      <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
        <p className="text-sm font-semibold text-indigo-800">🙋 인증 인정 요청</p>
        <p className="text-xs text-indigo-600/90 mt-1 leading-relaxed">
          보통은 <b>인증만 올리면 자동으로 그날 완료</b>돼요. 규칙상 자동 인정이 안 잡혔는데 실제로 수행한 경우에만,
          아래에서 그 게시물을 골라 <b>해당 일자 인증으로 인정해달라</b>고 리더에게 요청하세요.
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

      {/* 요청 보내기 — 내 게시물 목록 */}
      <section>
        <h3 className="text-sm font-bold text-gray-800 mb-2 px-1">내 게시물로 인정 요청</h3>
        {!canRequest ? (
          <p className="text-xs text-gray-400 px-1 py-4">지금은 인정 요청을 보낼 수 없어요 (챌린지 진행 중 · 완주 전에만 가능).</p>
        ) : requestable.length === 0 ? (
          <p className="text-xs text-gray-400 px-1 py-4">아직 올린 인증 게시물이 없어요. 먼저 인증을 올려주세요.</p>
        ) : (
          <ul className="space-y-2">
            {requestable.map((v) => {
              const status = requestByVerification.get(String(v.verificationId));
              return (
                <li
                  key={v.verificationId}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white"
                >
                  {v.imageUrl ? (
                    <img src={v.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">
                      {typeIcon(v.verificationType)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-700">
                      Day {v.day ?? "-"} · {typeIcon(v.verificationType)}
                      {v.questTitle ? ` · ${v.questTitle}` : ""}
                    </p>
                    {v.todayNote && <p className="text-xs text-gray-500 truncate mt-0.5">{v.todayNote}</p>}
                  </div>
                  {status ? (
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${STATUS_META[status]?.cls ?? "bg-gray-50 text-gray-500 border-gray-200"}`}>
                      {STATUS_META[status]?.label ?? status}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={requestMutation.isPending}
                      onClick={() => requestMutation.mutate({ verificationId: v.verificationId, day: v.day })}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0"
                    >
                      {v.day}일차 인정 요청
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
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
