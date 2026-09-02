import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 라이브 음성방 훅 — WebSocket 시그널링(chat-api) + WebRTC P2P 메시.
 * 미디어는 서버를 지나지 않는다. 연결 협상 규칙:
 *  - 새로 입장한 쪽(live:ready 수신자)이 기존 피어 전원에게 offer를 만든다
 *  - 기존 피어는 live:peer-joined를 받고 offer를 기다린다 (충돌 없는 단방향 협상)
 * 마이크는 역할과 무관하게 입장 시 1회 요청하고, 리스너는 track.enabled=false로 무음.
 * (역할 승급 시 재협상 없이 토글만으로 발언 가능 — 메시 재협상 복잡도 회피)
 */

const WS_URL = import.meta.env.VITE_WS_URL as string | undefined;

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUser = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCred = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  }
  return servers;
}

export type LiveRole = 'speaker' | 'listener';

export interface LivePeer {
  connectionId: string;
  displayName: string;
  isLeader: boolean;
  isHost: boolean;
  role: LiveRole;
  raised: boolean;
  stream: MediaStream | null;
}

export interface LiveChatMessage {
  messageId: string;
  displayName: string;
  text: string;
  createdAt: string;
  isLeader?: boolean;
  isHost?: boolean;
}

export type LiveStatus =
  | 'idle'
  | 'connecting'
  | 'joined'
  | 'ended'
  | 'kicked'
  | 'error';

interface Me {
  connectionId: string;
  displayName: string;
  isLeader: boolean;
  isHost: boolean;
  role: LiveRole;
}

export function useLiveRoom(challengeId: string | undefined, roomId: string | undefined, enabled: boolean) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [me, setMe] = useState<Me | null>(null);
  const [peers, setPeers] = useState<LivePeer[]>([]);
  const [micMuted, setMicMuted] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [micUnavailable, setMicUnavailable] = useState(false);
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);
  const [forcedMuteNotice, setForcedMuteNotice] = useState(0); // 개설자 뮤트 요청 수신 카운터 (토스트용)

  const wsRef = useRef<WebSocket | null>(null);
  const closedByUsRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const meRef = useRef<Me | null>(null);
  const micMutedRef = useRef(false);

  // ── 로컬 마이크 on/off 반영 (역할×뮤트) ────────────────────────────────
  const applyTrackEnabled = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const speaking = meRef.current?.role === 'speaker' && !micMutedRef.current;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = speaking;
    });
  }, []);

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const upsertPeer = useCallback((patch: Partial<LivePeer> & { connectionId: string }) => {
    setPeers((prev) => {
      const idx = prev.findIndex((p) => p.connectionId === patch.connectionId);
      if (idx < 0) {
        return [
          ...prev,
          {
            displayName: '참여자',
            isLeader: false,
            isHost: false,
            role: 'listener' as LiveRole,
            raised: false,
            stream: null,
            ...patch,
          },
        ];
      }
      const next = [...prev];
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  }, []);

  const removePeer = useCallback((connectionId: string) => {
    const pc = pcsRef.current.get(connectionId);
    if (pc) {
      pc.close();
      pcsRef.current.delete(connectionId);
    }
    pendingIceRef.current.delete(connectionId);
    setPeers((prev) => prev.filter((p) => p.connectionId !== connectionId));
  }, []);

  // ── RTCPeerConnection 생성 (공용) ─────────────────────────────────────
  const createPc = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = pcsRef.current.get(peerId);
      if (existing) existing.close();

      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      pcsRef.current.set(peerId, pc);

      const local = localStreamRef.current;
      if (local) {
        local.getAudioTracks().forEach((track) => pc.addTrack(track, local));
      } else {
        // 마이크 없는 참여(수신 전용) — 오디오 수신 방향은 열어둔다
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendWs({ action: 'live:signal', target: peerId, payload: { kind: 'ice', candidate: e.candidate.toJSON() } });
        }
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        upsertPeer({ connectionId: peerId, stream });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          // 일시 장애 — ICE 재시작 시도 (상대가 남아 있으면 회복)
          try {
            pc.restartIce();
          } catch {
            // 미지원 브라우저 — 무시
          }
        }
      };
      return pc;
    },
    [sendWs, upsertPeer],
  );

  const flushPendingIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(peerId) ?? [];
    pendingIceRef.current.delete(peerId);
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  // ── 시그널 처리 ───────────────────────────────────────────────────────
  const handleSignal = useCallback(
    async (from: string, payload: any) => {
      if (!payload || typeof payload !== 'object') return;
      if (payload.kind === 'offer') {
        const pc = createPc(from); // offer가 오면 항상 새 협상 (재입장 포함)
        await pc.setRemoteDescription(payload.sdp);
        await flushPendingIce(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWs({ action: 'live:signal', target: from, payload: { kind: 'answer', sdp: pc.localDescription } });
        return;
      }
      const pc = pcsRef.current.get(from);
      if (payload.kind === 'answer') {
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(payload.sdp).catch(() => undefined);
          await flushPendingIce(from, pc);
        }
        return;
      }
      if (payload.kind === 'ice' && payload.candidate) {
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(payload.candidate).catch(() => undefined);
        } else {
          const queue = pendingIceRef.current.get(from) ?? [];
          queue.push(payload.candidate);
          pendingIceRef.current.set(from, queue);
        }
      }
    },
    [createPc, flushPendingIce, sendWs],
  );

  /** 신규 입장자(나) → 기존 피어에게 offer 발신 */
  const offerTo = useCallback(
    async (peerId: string) => {
      const pc = createPc(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendWs({ action: 'live:signal', target: peerId, payload: { kind: 'offer', sdp: pc.localDescription } });
    },
    [createPc, sendWs],
  );

  const cleanup = useCallback(() => {
    for (const pc of pcsRef.current.values()) pc.close();
    pcsRef.current.clear();
    pendingIceRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setPeers([]);
  }, []);

  // ── 접속 수명주기 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !challengeId || !roomId) return;
    if (!WS_URL) {
      setStatus('error');
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setStatus('error');
      return;
    }

    let disposed = false;
    closedByUsRef.current = false;
    setStatus('connecting');

    (async () => {
      // 마이크는 입장 시 1회 확보 — 실패해도 수신 전용으로 입장
      try {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = false; // 역할 확정(live:ready) 전까지 무음
        });
      } catch {
        setMicUnavailable(true);
      }
      if (disposed) {
        cleanup();
        return;
      }

      const query = `live=${encodeURIComponent(`${challengeId}:${roomId}`)}`;
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}&${query}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ action: 'history' }));

      const handlePayload = async (raw: string) => {
        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return;
        }
        switch (payload?.type) {
          case 'live:ready': {
            const my: Me = {
              connectionId: payload.connectionId,
              displayName: payload.displayName,
              isLeader: Boolean(payload.isLeader),
              isHost: Boolean(payload.isHost),
              role: payload.role === 'speaker' ? 'speaker' : 'listener',
            };
            meRef.current = my;
            setMe(my);
            setStatus('joined');
            applyTrackEnabled();
            const roster: any[] = Array.isArray(payload.roster) ? payload.roster : [];
            const others = roster.filter((r) => !r.isMe);
            setPeers(
              others.map((r) => ({
                connectionId: r.connectionId,
                displayName: r.displayName,
                isLeader: Boolean(r.isLeader),
                isHost: Boolean(r.isHost),
                role: r.role === 'speaker' ? 'speaker' : 'listener',
                raised: false,
                stream: null,
              })),
            );
            // 신규 입장자인 내가 기존 전원에게 offer
            for (const r of others) await offerTo(r.connectionId).catch(() => undefined);
            break;
          }
          case 'live:peer-joined': {
            const p = payload.peer;
            if (p?.connectionId && p.connectionId !== meRef.current?.connectionId) {
              upsertPeer({
                connectionId: p.connectionId,
                displayName: p.displayName,
                isLeader: Boolean(p.isLeader),
                isHost: Boolean(p.isHost),
                role: p.role === 'speaker' ? 'speaker' : 'listener',
              });
            }
            break;
          }
          case 'live:peer-left':
            removePeer(String(payload.connectionId));
            break;
          case 'live:signal':
            await handleSignal(String(payload.from), payload.payload);
            break;
          case 'live:role': {
            const target = String(payload.connectionId);
            const role: LiveRole = payload.role === 'speaker' ? 'speaker' : 'listener';
            if (target === meRef.current?.connectionId) {
              meRef.current = { ...meRef.current!, role };
              setMe(meRef.current);
              if (role === 'listener') setHandRaised(false);
              applyTrackEnabled();
            } else {
              upsertPeer({ connectionId: target, role, raised: false });
            }
            break;
          }
          case 'live:hand': {
            const target = String(payload.connectionId);
            if (target !== meRef.current?.connectionId) {
              upsertPeer({ connectionId: target, raised: payload.raised === true });
            }
            break;
          }
          case 'live:mute':
            micMutedRef.current = true;
            setMicMuted(true);
            setForcedMuteNotice((n) => n + 1);
            applyTrackEnabled();
            break;
          case 'live:chat':
            if (payload.message) {
              setChatMessages((prev) =>
                prev.some((m) => m.messageId === payload.message.messageId)
                  ? prev
                  : [...prev, payload.message as LiveChatMessage],
              );
            }
            break;
          case 'live:kicked':
            closedByUsRef.current = true;
            setStatus('kicked');
            cleanup();
            break;
          case 'live:ended':
            closedByUsRef.current = true;
            setStatus('ended');
            cleanup();
            break;
          default:
            break;
        }
      };

      ws.onmessage = (event) => {
        const data = event.data;
        if (typeof data === 'string') void handlePayload(data);
        else if (data instanceof ArrayBuffer) void handlePayload(new TextDecoder().decode(data));
        else if (typeof Blob !== 'undefined' && data instanceof Blob)
          data.text().then((t) => void handlePayload(t)).catch(() => undefined);
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (closedByUsRef.current || disposed) return;
        // 재접속하지 않고 종료 취급 — 메시 전체 재협상보다 재입장이 단순·확실
        setStatus((prev) => (prev === 'joined' || prev === 'connecting' ? 'error' : prev));
        cleanup();
      };
      ws.onerror = () => {
        // onclose에서 일괄 처리
      };
    })();

    return () => {
      disposed = true;
      closedByUsRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      cleanup();
      meRef.current = null;
      setMe(null);
      setStatus('idle');
      setChatMessages([]);
      setHandRaised(false);
      setMicMuted(false);
      micMutedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, challengeId, roomId]);

  // ── 컨트롤 ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    micMutedRef.current = !micMutedRef.current;
    setMicMuted(micMutedRef.current);
    applyTrackEnabled();
  }, [applyTrackEnabled]);

  const raiseHand = useCallback(() => {
    setHandRaised((prev) => {
      const next = !prev;
      sendWs({ action: 'live:hand', raised: next });
      return next;
    });
  }, [sendWs]);

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      sendWs({ action: 'sendMessage', text: trimmed });
      return true;
    },
    [sendWs],
  );

  const setPeerRole = useCallback(
    (connectionId: string, role: LiveRole) => sendWs({ action: 'live:role', target: connectionId, role }),
    [sendWs],
  );
  const mutePeer = useCallback(
    (connectionId: string) => sendWs({ action: 'live:mute', target: connectionId }),
    [sendWs],
  );
  const kickPeer = useCallback(
    (connectionId: string) => sendWs({ action: 'live:kick', target: connectionId }),
    [sendWs],
  );
  const announceEnd = useCallback(() => sendWs({ action: 'live:end' }), [sendWs]);

  /** 녹음(개설자)용 — 내 마이크 스트림 (없으면 null) */
  const getLocalStream = useCallback(() => localStreamRef.current, []);

  return {
    status,
    me,
    peers,
    micMuted,
    micUnavailable,
    handRaised,
    chatMessages,
    forcedMuteNotice,
    toggleMute,
    raiseHand,
    sendChat,
    setPeerRole,
    mutePeer,
    kickPeer,
    announceEnd,
    getLocalStream,
  };
}
