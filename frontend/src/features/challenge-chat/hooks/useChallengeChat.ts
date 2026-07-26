import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 챌린지 단체 채팅 WebSocket 훅.
 * - 연결 URL: `${VITE_WS_URL}?token=<idToken>&challengeId=<id>` (브라우저 WS는 헤더 불가 → 쿼리스트링)
 * - 접속 직후 {action:'history'} 전송 → 서버가 {type:'ready', displayName, messages} 응답
 * - 전송: {action:'sendMessage', text} → 서버가 방 전체에 {type:'message', message} 브로드캐스트
 * - 끊기면 지수 백오프 재연결(enabled 동안). 언마운트/challengeId 변경 시 정리.
 */
export interface ChatMessage {
  messageId: string;
  displayName: string;
  text: string;
  createdAt: string;
  isLeader?: boolean;
}

export type ChatStatus = "connecting" | "open" | "closed" | "error";

const WS_URL = import.meta.env.VITE_WS_URL as string | undefined;
const MAX_BACKOFF_MS = 15_000;

export function useChallengeChat(challengeId: string | undefined, enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("closed");
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null);
  const [myIsLeader, setMyIsLeader] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const closedByUsRef = useRef(false);

  const appendMessage = useCallback((incoming: ChatMessage) => {
    setMessages((prev) =>
      prev.some((m) => m.messageId === incoming.messageId) ? prev : [...prev, incoming],
    );
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !challengeId) return;
    if (!WS_URL) {
      setStatus("error");
      return;
    }
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setStatus("error");
      return;
    }

    closedByUsRef.current = false;
    setStatus("connecting");
    const url = `${WS_URL}?token=${encodeURIComponent(token)}&challengeId=${encodeURIComponent(
      challengeId,
    )}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      setStatus("open");
      ws.send(JSON.stringify({ action: "history" }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "ready") {
          setMyDisplayName(payload.displayName ?? null);
          setMyIsLeader(Boolean(payload.isLeader));
          setMessages(Array.isArray(payload.messages) ? payload.messages : []);
        } else if (payload?.type === "message" && payload.message) {
          appendMessage(payload.message as ChatMessage);
        }
      } catch {
        // 무시 — 알 수 없는 프레임
      }
    };

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onclose = () => {
      wsRef.current = null;
      setStatus("closed");
      if (closedByUsRef.current || !enabled) return;
      // 지수 백오프 재연결
      const delay = Math.min(1000 * 2 ** attemptsRef.current, MAX_BACKOFF_MS);
      attemptsRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };
  }, [enabled, challengeId, appendMessage]);

  useEffect(() => {
    if (!enabled || !challengeId) return;
    connect();
    return () => {
      closedByUsRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setMessages([]);
      setMyDisplayName(null);
      setMyIsLeader(false);
      setStatus("closed");
      attemptsRef.current = 0;
    };
  }, [enabled, challengeId, connect]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    const ws = wsRef.current;
    if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ action: "sendMessage", text: trimmed }));
    return true;
  }, []);

  return { messages, status, myDisplayName, myIsLeader, send };
}
