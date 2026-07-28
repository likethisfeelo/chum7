import { useCallback, useEffect, useRef, useState } from "react";

/**
 * WebSocket 채팅 훅 — 챌린지 단체 채팅 + 1:1 리더 DM 겸용.
 * 연결 쿼리: 그룹=`challengeId=<id>`, DM=`dm=<challengeId>:<participantId>`.
 * DM은 읽음/안읽음(peerLastReadAt) + markRead() 지원.
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

export function useChatSocket(query: string | null, enabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("closed");
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null);
  const [myIsLeader, setMyIsLeader] = useState(false);
  const [isDm, setIsDm] = useState(false);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);

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
    if (!enabled || !query) return;
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
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}&${query}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      setStatus("open");
      ws.send(JSON.stringify({ action: "history" }));
    };

    const handlePayload = (raw: string) => {
      try {
        const payload = JSON.parse(raw);
        if (payload?.type === "ready") {
          setMyDisplayName(payload.displayName ?? null);
          setMyIsLeader(Boolean(payload.isLeader));
          setIsDm(Boolean(payload.isDm));
          setPeerLastReadAt(payload.peerLastReadAt ?? null);
          setMessages(Array.isArray(payload.messages) ? payload.messages : []);
        } else if (payload?.type === "message" && payload.message) {
          appendMessage(payload.message as ChatMessage);
        } else if (payload?.type === "read" && typeof payload.at === "string") {
          setPeerLastReadAt((prev) => (!prev || payload.at > prev ? payload.at : prev));
        }
      } catch {
        // 무시
      }
    };

    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data === "string") handlePayload(data);
      else if (data instanceof ArrayBuffer) handlePayload(new TextDecoder().decode(data));
      else if (typeof Blob !== "undefined" && data instanceof Blob)
        data.text().then(handlePayload).catch(() => undefined);
    };

    ws.onerror = () => setStatus("error");

    ws.onclose = () => {
      wsRef.current = null;
      setStatus("closed");
      if (closedByUsRef.current || !enabled) return;
      const delay = Math.min(1000 * 2 ** attemptsRef.current, MAX_BACKOFF_MS);
      attemptsRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };
  }, [enabled, query, appendMessage]);

  useEffect(() => {
    if (!enabled || !query) return;
    connect();
    return () => {
      closedByUsRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setMessages([]);
      setMyDisplayName(null);
      setMyIsLeader(false);
      setIsDm(false);
      setPeerLastReadAt(null);
      setStatus("closed");
      attemptsRef.current = 0;
    };
  }, [enabled, query, connect]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    const ws = wsRef.current;
    if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ action: "sendMessage", text: trimmed }));
    return true;
  }, []);

  const markRead = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: "read" }));
  }, []);

  return { messages, status, myDisplayName, myIsLeader, isDm, peerLastReadAt, send, markRead };
}

/** 챌린지 단체 채팅 — 기존 패널용 얇은 래퍼. */
export function useChallengeChat(challengeId: string | undefined, enabled: boolean) {
  return useChatSocket(challengeId ? `challengeId=${encodeURIComponent(challengeId)}` : null, enabled);
}
