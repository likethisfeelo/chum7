import { useEffect, useRef, useState } from "react";
import { FiChevronDown, FiChevronUp, FiSend, FiAlertCircle } from "react-icons/fi";
import { useChallengeChat } from "../hooks/useChallengeChat";

/**
 * 챌린지 채팅방 연결 UI — 인라인 섹션(준비중 챌린지 전용, 호출부에서 게이팅).
 * 기본은 접힌 상태로 "채팅방 입장" 버튼만 보여주고, 입장 시에만 WebSocket 을 연결한다
 * (피드를 열기만 해도 소켓이 붙는 것을 방지). 신원은 서버가 부여하는 일일 반익명 활동명.
 */
export function ChallengeChatPanel({ challengeId }: { challengeId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // 채팅 이용 주의사항 — 입장 시 기본 노출, 접기/펼치기 가능
  const [showNotice, setShowNotice] = useState(true);
  const { messages, status, myDisplayName, myIsLeader, send } = useChallengeChat(
    challengeId,
    isOpen,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isOpen]);

  // #chat 딥링크(내 챌린지 '채팅방' 버튼)로 진입하면 자동 입장 + 스크롤
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#chat") {
      setIsOpen(true);
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

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
    <section ref={sectionRef} id="chat" className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-900">💬 채팅방</h3>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
            준비중 참여자
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
        >
          {isOpen ? (
            <>
              접기 <FiChevronUp size={14} />
            </>
          ) : (
            <>
              입장 <FiChevronDown size={14} />
            </>
          )}
        </button>
      </div>

      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="mt-3 w-full rounded-xl border border-primary-200 bg-primary-50 py-2.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100"
        >
          채팅방 입장하기
        </button>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-xs text-gray-400">
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
            </span>{" "}
            {statusLabel}
            {myDisplayName ? ` · 나: ${myDisplayName}` : ""}
            {myIsLeader ? " 👑" : ""}
          </p>

          {/* 채팅 이용 주의사항 — 상태줄 바로 아래, 클릭 시 펼침/접힘 */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowNotice((v) => !v)}
              aria-expanded={showNotice}
              className="flex w-full items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
            >
              <FiAlertCircle size={13} className="flex-shrink-0" />
              채팅 이용 주의사항
              {showNotice ? (
                <FiChevronUp size={13} className="ml-auto" />
              ) : (
                <FiChevronDown size={13} className="ml-auto" />
              )}
            </button>
            {showNotice && (
              <ul className="mt-1.5 space-y-1 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2.5 text-[11px] leading-relaxed text-gray-600">
                <li>• 챌린지가 <b className="font-semibold text-gray-700">시작되면 채팅방은 사라져요.</b></li>
                <li>• 챌린지에 대해 궁금한 점을 묻고, 함께할 분들과 다정하게 인사 나눠요.</li>
                <li>• 익명으로 진행되니 <b className="font-semibold text-gray-700">개인정보 등 민감한 내용은 공유·질문을 자제</b>해주세요.</li>
                <li>• 개인적이거나 민감한 이야기는 <b className="font-semibold text-gray-700">‘리더 DM’</b>으로 챌린지 리더에게 전해주세요.</li>
              </ul>
            )}
          </div>

          {/* 메시지 목록 */}
          <div
            ref={listRef}
            className="h-64 space-y-3 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-3"
          >
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
                      <span
                        className={`mb-0.5 flex items-center gap-1 text-xs ${
                          m.isLeader ? "font-semibold text-amber-600" : "text-gray-400"
                        }`}
                      >
                        {m.isLeader && <span>👑</span>}
                        {m.displayName}
                      </span>
                    )}
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                        mine
                          ? "rounded-br-sm bg-primary-500 text-white"
                          : m.isLeader
                            ? "rounded-bl-sm border border-amber-200 bg-amber-50 text-gray-800"
                            : "rounded-bl-sm border border-gray-100 bg-white text-gray-800"
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
          <div className="mt-2 flex items-center gap-2">
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
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FiSend size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
