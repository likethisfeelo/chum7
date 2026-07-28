import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiSend } from "react-icons/fi";
import { useChatSocket } from "../hooks/useChallengeChat";

/**
 * 리더 DM (1:1) — /dm/:challengeId/:participantId.
 * 방은 (challengeId, participantId) 기준. 리더/해당 참여자만 입장(서버 검증).
 * 읽음/안읽음: 내 메시지에 상대가 읽었으면 '읽음' 표시.
 */
export function DmPage() {
  const navigate = useNavigate();
  const { challengeId, participantId } = useParams();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const query = useMemo(
    () => (challengeId && participantId ? `dm=${challengeId}:${participantId}` : null),
    [challengeId, participantId],
  );

  const { messages, status, myIsLeader, peerLastReadAt, send, markRead } = useChatSocket(
    query,
    true,
  );

  // 새 메시지 도착 시 하단 스크롤 + 읽음 처리
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    if (status === "open") markRead();
  }, [messages, status, markRead]);

  const handleSend = () => {
    if (send(draft)) setDraft("");
  };

  // 내가 보낸 마지막 메시지가 읽혔는지
  const myMessages = messages.filter((m) => Boolean(m.isLeader) === myIsLeader);
  const lastMine = myMessages[myMessages.length - 1];
  const lastMineRead =
    lastMine && peerLastReadAt ? peerLastReadAt >= lastMine.createdAt : false;

  const peerLabel = myIsLeader ? "참여자" : "챌린지 리더";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button onClick={() => navigate(-1)} className="rounded-full p-2 hover:bg-gray-100">
          <FiArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-gray-900">{peerLabel}와의 DM</h1>
          <p className="text-xs text-gray-400">
            {status === "open"
              ? "실시간 연결됨"
              : status === "connecting"
                ? "연결 중…"
                : status === "error"
                  ? "연결할 수 없어요"
                  : "연결 끊김"}
          </p>
        </div>
      </div>

      {/* 메시지 */}
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="mt-10 text-center text-sm text-gray-400">
            {status === "open"
              ? "아직 대화가 없어요. 먼저 메시지를 보내보세요."
              : status === "error"
                ? "대화를 불러올 수 없어요."
                : "연결 중…"}
          </p>
        ) : (
          messages.map((m) => {
            const mine = Boolean(m.isLeader) === myIsLeader;
            const isLastMine = mine && m.messageId === lastMine?.messageId;
            return (
              <div key={m.messageId} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && <span className="mb-0.5 text-xs text-gray-400">{m.displayName}</span>}
                <div
                  className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] ${
                    mine
                      ? "rounded-br-sm bg-primary-500 text-white"
                      : "rounded-bl-sm border border-gray-100 bg-gray-50 text-gray-800"
                  }`}
                >
                  {m.text}
                </div>
                {isLastMine && (
                  <span className="mt-0.5 text-[11px] text-gray-400">
                    {lastMineRead ? "읽음" : "안읽음"}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 입력 */}
      <div className="sticky bottom-0 flex items-center gap-2 border-t border-gray-100 bg-white px-3 py-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          maxLength={1000}
          placeholder={status === "open" ? "메시지를 입력하세요" : "연결 중…"}
          disabled={status !== "open"}
          className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:border-primary-400 focus:outline-none disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={status !== "open" || !draft.trim()}
          aria-label="보내기"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 active:scale-95 disabled:opacity-40"
        >
          <FiSend size={16} />
        </button>
      </div>
    </div>
  );
}
