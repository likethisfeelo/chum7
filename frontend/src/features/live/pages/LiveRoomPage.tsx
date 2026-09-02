import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loading } from '@/shared/components/Loading';
import { ReportButton } from '@/features/feed/components/ReportModal';
import { liveApi } from '../api/liveApi';
import { useLiveRoom, type LivePeer } from '../hooks/useLiveRoom';
import { useLiveRecorder } from '../hooks/useLiveRecorder';

/**
 * 라이브 음성방 — /live/:challengeId/:roomId (풀스크린, 탭바 없음).
 * 입장 게이트(녹음 동의 / 오프더레코드 경고) → P2P 음성 + 휘발성 채팅.
 * 개설자: 역할·뮤트·강퇴·종료 + (저장 방) 로컬 믹스 녹음 → 종료 시 업로드.
 */

function ConsentGate({
  recording,
  onAgree,
  onCancel,
}: {
  recording: boolean;
  onAgree: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 text-center">
        <p className="text-3xl mb-3">{recording ? '🔴' : '🔒'}</p>
        <h2 className="text-lg font-extrabold text-gray-900">
          {recording ? '이 방은 녹음됩니다' : '이 방은 저장되지 않는 방입니다'}
        </h2>
        {recording ? (
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">
            방에서 나누는 음성 대화가 <b>녹음</b>되며, 방을 개설한 사람이 원본을
            보관하고 다운로드할 수 있어요. 동의하시면 입장할 수 있습니다.
          </p>
        ) : (
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">
            대화와 채팅 모두 <b>어디에도 저장되지 않아요</b>. 참여자의 무단 녹음·녹화
            및 그 유포는 관련 법령에 따라 <b>법적 책임</b>을 질 수 있으며, CHUM7
            이용약관에 따라 <b>계정 제재</b> 대상입니다.
          </p>
        )}
        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onAgree}
            className="w-full py-3.5 rounded-2xl bg-primary-600 text-white font-bold text-sm"
          >
            {recording ? '녹음에 동의하고 입장' : '확인했습니다 — 입장'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-medium text-sm"
          >
            돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

function PeerTile({
  peer,
  isHostView,
  onControl,
}: {
  peer: { displayName: string; role: string; isHost: boolean; isLeader: boolean; raised?: boolean; isMe?: boolean; muted?: boolean };
  isHostView: boolean;
  onControl?: () => void;
}) {
  const speaking = peer.role === 'speaker';
  return (
    <button
      type="button"
      onClick={isHostView && onControl ? onControl : undefined}
      className={`relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-colors ${
        speaking ? 'bg-white/10 border-amber-300/40' : 'bg-white/5 border-white/10'
      } ${isHostView && onControl ? 'cursor-pointer hover:bg-white/15' : 'cursor-default'}`}
    >
      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${
          speaking ? 'bg-amber-400/20 ring-2 ring-amber-300/60' : 'bg-white/10'
        }`}
      >
        {speaking ? '🎙' : '🎧'}
      </div>
      <p className="text-[11px] font-semibold text-white/90 max-w-[72px] truncate">
        {peer.displayName}
        {peer.isMe ? ' (나)' : ''}
      </p>
      <div className="flex items-center gap-1">
        {peer.isHost && <span className="text-[9px] px-1 rounded bg-amber-400/30 text-amber-200">개설자</span>}
        {!peer.isHost && peer.isLeader && (
          <span className="text-[9px] px-1 rounded bg-sky-400/30 text-sky-200">리더</span>
        )}
        {peer.muted && <span className="text-[10px]">🔇</span>}
      </div>
      {peer.raised && <span className="absolute -top-1.5 -right-1.5 text-lg">✋</span>}
    </button>
  );
}

export const LiveRoomPage = () => {
  const { challengeId, roomId } = useParams<{ challengeId: string; roomId: string }>();
  const navigate = useNavigate();
  const [consented, setConsented] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [controlPeerId, setControlPeerId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [sessionKey, setSessionKey] = useState(0); // '다시 연결' — 세션 재시작
  const [starting, setStarting] = useState(false);
  const roleHintShownRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const { data: roomData, isLoading, isError, refetch: refetchRoom } = useQuery({
    queryKey: ['live-room', challengeId, roomId],
    enabled: Boolean(challengeId && roomId),
    retry: false,
    // 예정 방은 개설자가 시작하면 바로 바뀌어야 하므로 짧게 폴링
    refetchInterval: (q) => (q.state.data?.room?.status === 'scheduled' ? 15_000 : false),
    queryFn: () => liveApi.getRoom(challengeId!, roomId!),
  });
  const room = roomData?.room;
  const isHost = roomData?.isHost === true;
  const canManage = roomData?.canManage === true;

  const live = useLiveRoom(
    challengeId,
    roomId,
    consented && room?.status === 'live',
    roomData?.iceServers ?? null,
    sessionKey,
  );
  const {
    status, me, peers, micMuted, micUnavailable, handRaised, chatMessages, forcedMuteNotice,
    toggleMute, raiseHand, sendChat, setPeerRole, mutePeer, kickPeer, announceEnd, getLocalStream,
  } = live;

  const peerStreams = useMemo(
    () => peers.map((p) => p.stream).filter((s): s is MediaStream => Boolean(s)),
    [peers],
  );
  const recorder = useLiveRecorder({
    enabled: consented && isHost && room?.recording === true && status === 'joined',
    challengeId,
    roomId,
    localStream: getLocalStream(),
    peerStreams,
  });

  // 개설자 뮤트 요청 수신 토스트
  useEffect(() => {
    if (forcedMuteNotice > 0) toast('개설자가 마이크를 잠시 꺼달라고 요청했어요 🔇');
  }, [forcedMuteNotice]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length, showChat]);

  // 첫 입장 역할 안내 — 리스너에게 '손들기'로 발언 신청하는 법을 1회 알려준다
  useEffect(() => {
    if (status !== 'joined' || !me || roleHintShownRef.current) return;
    roleHintShownRef.current = true;
    if (me.role === 'listener') {
      toast('🎧 듣기로 입장했어요. 말하고 싶으면 ✋ 발언 신청을 눌러주세요', { duration: 5000 });
    } else if (!me.isHost) {
      toast('🎙 스피커로 입장했어요. 마이크 버튼으로 켜고 끌 수 있어요', { duration: 4000 });
    }
  }, [status, me]);

  if (!challengeId || !roomId) return null;
  if (isLoading) return <Loading />;
  if (isError || !room) {
    return (
      <EndScreen emoji="🔍" title="방을 찾을 수 없어요" desc="주소가 잘못됐거나 이미 정리된 방이에요." onBack={() => navigate(-1)} />
    );
  }
  if (room.status === 'ended' && !ending) {
    return (
      <EndScreen emoji="🌙" title="종료된 방이에요" desc="다음 방이 열리면 챌린지에서 알려드릴게요." onBack={() => navigate(`/challenges/${challengeId}`)} />
    );
  }
  // 예정 방 — 개설자(·리더·매니저)는 여기서 시작, 참여자는 예정 안내
  if (room.status === 'scheduled') {
    const when = room.scheduledAt
      ? new Date(room.scheduledAt).toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit',
        })
      : '';
    const startNow = async () => {
      setStarting(true);
      try {
        await liveApi.startRoom(challengeId, roomId);
        toast.success('방을 시작했어요. 참여자에게 알림을 보냈어요');
        await refetchRoom();
      } catch (err: any) {
        toast.error(err?.response?.data?.message || '시작하지 못했어요');
      } finally {
        setStarting(false);
      }
    };
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl mb-4">🗓</p>
        <p className="text-lg font-bold text-white">{room.title || '음성방'}</p>
        <p className="mt-2 text-sm text-amber-300 font-semibold">{when} 예정</p>
        <p className="mt-2 text-xs text-white/50">
          {room.recording ? '🔴 녹음되는 방' : '🔒 저장 안 함 방'} · 최대 {room.maxParticipants}명
        </p>
        {isHost || canManage ? (
          <>
            <button
              type="button"
              onClick={startNow}
              disabled={starting}
              className="mt-6 px-8 py-3.5 rounded-2xl bg-amber-500 text-white text-sm font-bold disabled:opacity-60"
            >
              {starting ? '시작 중...' : '▶ 지금 시작하기'}
            </button>
            <p className="mt-2 text-[11px] text-white/40">시작하면 참여자 전원에게 알림이 나가요</p>
          </>
        ) : (
          <p className="mt-6 text-sm text-white/70 leading-relaxed">
            아직 시작 전이에요.
            <br />
            개설자가 시작하면 알림으로 알려드릴게요 — 이 화면을 열어두면 자동으로 이어집니다.
          </p>
        )}
        <button
          type="button"
          onClick={() => navigate(`/challenges/${challengeId}`)}
          className="mt-6 px-6 py-3 rounded-2xl bg-white/10 text-white/80 text-sm font-bold"
        >
          돌아가기
        </button>
      </div>
    );
  }
  if (!consented) {
    return (
      <ConsentGate
        recording={room.recording}
        onAgree={async () => {
          try {
            await liveApi.recordConsent(challengeId, roomId, room.recording ? 'record_consent' : 'offrecord_ack');
          } catch {
            // 기록 실패는 입장을 막지 않는다 (고지는 이미 화면으로 완료)
          }
          setConsented(true);
        }}
        onCancel={() => navigate(-1)}
      />
    );
  }
  if (status === 'kicked') {
    return <EndScreen emoji="🚪" title="방에서 내보내졌어요" desc="개설자가 퇴장 처리했어요." onBack={() => navigate(`/challenges/${challengeId}`)} />;
  }
  if (status === 'ended') {
    return <EndScreen emoji="👋" title="방이 종료됐어요" desc="함께해줘서 고마워요!" onBack={() => navigate(`/challenges/${challengeId}`)} />;
  }
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl mb-4">⚠️</p>
        <p className="text-lg font-bold text-white">연결이 끊겼어요</p>
        <p className="mt-2 text-sm text-white/60">
          정원이 가득 찼거나 네트워크가 잠시 불안정했어요.
          <br />
          다시 연결하면 처음부터 새로 입장합니다.
        </p>
        <button
          type="button"
          onClick={() => setSessionKey((k) => k + 1)}
          className="mt-6 px-8 py-3.5 rounded-2xl bg-white text-gray-900 text-sm font-bold"
        >
          🔄 다시 연결
        </button>
        <button
          type="button"
          onClick={() => navigate(`/challenges/${challengeId}`)}
          className="mt-3 px-6 py-3 rounded-2xl bg-white/10 text-white/80 text-sm font-bold"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const endRoom = async () => {
    if (!window.confirm('방을 종료할까요? 모든 참여자가 나가게 돼요.')) return;
    setEnding(true);
    try {
      if (room.recording) {
        const done = await recorder.stopAndUpload();
        if (!done) toast.error('녹음 업로드에 실패했어요 — 방은 종료돼요');
        else toast.success('녹음을 저장했어요. 운영탭에서 다운로드할 수 있어요');
      }
      announceEnd();
      await liveApi.endRoom(challengeId, roomId);
    } catch {
      toast.error('종료 처리 중 문제가 생겼어요');
    }
    navigate(`/challenges/${challengeId}`);
  };

  const controlPeer: LivePeer | undefined = peers.find((p) => p.connectionId === controlPeerId);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* 피어 오디오 (숨김) */}
      {peers.map((p) =>
        p.stream ? <PeerAudio key={p.connectionId} stream={p.stream} /> : null,
      )}

      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 pt-5 pb-3">
        <button type="button" onClick={() => navigate(-1)} className="text-white/70 hover:text-white text-xl px-1">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold text-sm truncate">{room.title || '음성방'}</p>
          <p className="text-white/50 text-[11px]">
            {status === 'joined' ? `${peers.length + 1}명 참여 중` : '연결 중...'}
          </p>
        </div>
        {room.recording ? (
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-300 bg-red-500/20 border border-red-400/30 px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> REC
          </span>
        ) : (
          <span className="text-[10px] font-bold text-white/70 bg-white/10 border border-white/20 px-2 py-1 rounded-full">
            🔒 저장 안 함
          </span>
        )}
        {!isHost && (
          <ReportButton
            target={{ targetType: 'live_room', targetId: roomId }}
            className="text-white/40 hover:text-red-400 transition-colors text-sm px-1"
          />
        )}
      </div>

      {/* 안내 줄 — 오프더레코드 상시 고지 */}
      {!room.recording && (
        <p className="mx-4 mb-2 text-[10px] text-white/40 leading-relaxed">
          저장되지 않는 방 — 무단 녹음·녹화·유포는 법적 책임 및 계정 제재 대상이에요.
        </p>
      )}
      {micUnavailable && (
        <p className="mx-4 mb-2 text-[10px] text-amber-300/80">마이크를 사용할 수 없어 듣기 전용으로 입장했어요.</p>
      )}

      {/* 참여자 그리드 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {me && (
            <PeerTile
              peer={{ displayName: me.displayName, role: me.role, isHost: me.isHost, isLeader: me.isLeader, isMe: true, muted: micMuted }}
              isHostView={false}
            />
          )}
          {peers.map((p) => (
            <PeerTile
              key={p.connectionId}
              peer={p}
              isHostView={isHost}
              onControl={() => setControlPeerId(p.connectionId)}
            />
          ))}
        </div>

        {/* 휘발성 채팅 */}
        {showChat && (
          <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-3">
            <p className="text-[10px] text-white/40 mb-2">
              방 채팅 — 어디에도 저장되지 않고 방이 닫히면 사라져요
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {chatMessages.map((m) => (
                <p key={m.messageId} className="text-xs text-white/85 leading-relaxed">
                  <span className={`font-bold ${m.isHost ? 'text-amber-300' : m.isLeader ? 'text-sky-300' : 'text-white/60'}`}>
                    {m.displayName}
                  </span>{' '}
                  {m.text}
                </p>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (sendChat(chatInput)) setChatInput('');
              }}
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={500}
                placeholder="메시지..."
                className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/30"
              />
              <button type="submit" className="px-3 py-2 rounded-xl bg-primary-500 text-white text-xs font-bold">
                전송
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 하단 컨트롤 */}
      <div className="px-4 pb-6 pt-2 flex items-center justify-center gap-3 bg-gradient-to-t from-black/40 to-transparent">
        {me?.role === 'speaker' ? (
          <button
            type="button"
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${
              micMuted ? 'bg-white/10 text-white/60' : 'bg-emerald-500 text-white'
            }`}
            aria-label={micMuted ? '마이크 켜기' : '마이크 끄기'}
          >
            {micMuted ? '🔇' : '🎙'}
          </button>
        ) : (
          <button
            type="button"
            onClick={raiseHand}
            className={`h-12 px-5 rounded-full text-sm font-bold ${
              handRaised ? 'bg-amber-400 text-gray-900' : 'bg-white/10 text-white'
            }`}
          >
            ✋ {handRaised ? '손 내리기' : '발언 신청'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowChat((v) => !v)}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${showChat ? 'bg-white/25 text-white' : 'bg-white/10 text-white/70'}`}
          aria-label="채팅"
        >
          💬
        </button>
        {isHost ? (
          <button
            type="button"
            onClick={endRoom}
            disabled={ending}
            className="h-12 px-5 rounded-full bg-red-500 text-white text-sm font-bold disabled:opacity-60"
          >
            {ending ? '정리 중...' : room.recording ? '종료 + 저장' : '방 종료'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate(`/challenges/${challengeId}`)}
            className="h-12 px-5 rounded-full bg-white/10 text-white/80 text-sm font-bold"
          >
            나가기
          </button>
        )}
      </div>

      {/* 개설자 — 참여자 제어 시트 */}
      {isHost && controlPeer && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setControlPeerId(null)}>
          <div className="w-full bg-white rounded-t-3xl p-5 space-y-2" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm font-bold text-gray-900 mb-1">
              {controlPeer.displayName}
              {controlPeer.raised && ' ✋'}
            </p>
            {controlPeer.role === 'listener' ? (
              <button
                type="button"
                onClick={() => {
                  setPeerRole(controlPeer.connectionId, 'speaker');
                  setControlPeerId(null);
                }}
                className="w-full py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold"
              >
                🎙 스피커로 초대
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPeerRole(controlPeer.connectionId, 'listener');
                  setControlPeerId(null);
                }}
                className="w-full py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 text-sm font-semibold"
              >
                🎧 리스너로 내리기
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                mutePeer(controlPeer.connectionId);
                setControlPeerId(null);
              }}
              className="w-full py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold"
            >
              🔇 마이크 꺼달라고 요청
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('이 참여자를 내보낼까요?')) {
                  kickPeer(controlPeer.connectionId);
                }
                setControlPeerId(null);
              }}
              className="w-full py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-semibold"
            >
              🚪 내보내기
            </button>
            <button
              type="button"
              onClick={() => setControlPeerId(null)}
              className="w-full py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-medium"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function PeerAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => undefined); // 입장 게이트 탭이 사용자 제스처 역할
    }
  }, [stream]);
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio ref={ref} autoPlay playsInline hidden />;
}

function EndScreen({ emoji, title, desc, onBack }: { emoji: string; title: string; desc: string; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl mb-4">{emoji}</p>
      <p className="text-lg font-bold text-white">{title}</p>
      <p className="mt-2 text-sm text-white/60">{desc}</p>
      <button type="button" onClick={onBack} className="mt-6 px-6 py-3 rounded-2xl bg-white text-gray-900 text-sm font-bold">
        돌아가기
      </button>
    </div>
  );
}
