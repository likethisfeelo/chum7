import { useEffect, useRef, useState } from "react";
import { FiMessageCircle, FiSend, FiX } from "react-icons/fi";
import { useChallengeChat } from "../hooks/useChallengeChat";

/**
 * 챌린지 단체 채팅 위젯 — 우하단 플로팅 버튼 + 패널.
 * 참여자 전용(호출부에서 게이팅). 연결은 패널이 열려 있는 동안에만 유지한다.
 * 신원은 서버가 부여하는 일일 반익명 활동명(예: 수달-042)으로 표시된다.
 */
export function ChallengeChatPanel({ challengeId }: { challengeId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { messages, status, myDisplayName, send } = useChallengeChat(challengeId, isOpen);
  const listRef = useRef<HTMLDivElement>(null);

  // 새 메시지 도착 시 하단으로 스크롤
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isOpen]);

  const handleSend = () => {
    if (send(draft)) setDraft("");
  };

  const statusLabel =
    status === "open"
      ? "실시간 연결됨"
      : status === "connecting"
        ? "연결 중…"
        : status === "error"
          ? "연결할 수 없어요"
          : "연결 끊김";

  return (
    <>
      {/* 플로팅 토글 버튼 */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="챌린지 채팅 열기"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition hover:bg-orange-600 active:scale-95 md:bottom-6"
      >
        {isOpen ? <FiX size={24} /> : <FiMessageCircle size={24} />}
      </button>

      {isOpen && (
        <div className="fixed bottom-36 right-4 z-40 flex h-[28rem] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl md:bottom-24">
          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">챌린지 채팅</p>
              <p className="text-xs text-gray-400">
                <span
                  className={
                    status === "open"
                      ? "text-green-500"
                      : status === "error"
                        ? "text-red-400"
                        : "text-gray-400"
                  }
                >
                  ●
                </span>
                {statusLabel}
                {myDisplayName ? ` · 나: ${myDisplayName}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="닫기"
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <FiX size={18} />
            </button>
          </div>

          {/* 메시지 목록 */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <p className="mt-8 text-center text-sm text-gray-400">
                {status === "open"
                  ? "아직 대화가 없어요. 먼저 인사를 건네보세요!"
                  : status === "error"
                    ? "채팅에 연결할 수 없어요."
                    : "연결 중…"}
              </p>
            ) : (
              messages.map((m) => {
                const mine = myDisplayName != null && m.displayName === myDisplayName;
                return (
                  <div
                    key={m.messageId}
                    className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                  >
                    {!mine && (
                      <span className="mb-0.5 text-xs text-gray-400">{m.displayName}</span>
                    )}
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                        mine
                          ? "rounded-br-sm bg-orange-500 text-white"
                          : "rounded-bl-sm bg-gray-100 text-gray-800"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 입력 */}
          <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
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
              className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:border-orange-400 focus:outline-none disabled:bg-gray-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={status !== "open" || !draft.trim()}
              aria-label="보내기"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white transition hover:bg-orange-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FiSend size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
