import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { liveApi, type LiveRecordingFile } from '../api/liveApi';

/**
 * 챌린지 라이브 배너 — 진행 중인 방이 있으면 입장 배너, 없으면(리더·매니저) 개설 버튼.
 * 개설 시 저장 여부를 확정한다(기본 저장함 · 이후 변경 불가).
 * 종료된 저장 방의 원본 다운로드/삭제(개설자)도 여기서 제공한다.
 */
export function LiveRoomBanner({ challengeId, canHost }: { challengeId: string; canHost: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [recording, setRecording] = useState(true); // 제품 결정: 기본 저장함
  const [title, setTitle] = useState('');

  const { data: activeRoom } = useQuery({
    queryKey: ['live-active', challengeId],
    enabled: Boolean(challengeId),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: () => liveApi.getActiveRoom(challengeId),
  });

  const createMutation = useMutation({
    mutationFn: () => liveApi.createRoom(challengeId, { recording, title: title.trim() || undefined }),
    onSuccess: (room) => {
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ['live-active', challengeId] });
      navigate(`/live/${challengeId}/${room.roomId}`);
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      if (data?.error === 'LIVE_ROOM_EXISTS' && data?.data?.roomId) {
        navigate(`/live/${challengeId}/${data.data.roomId}`);
        return;
      }
      toast.error(data?.message || '방을 열지 못했어요');
    },
  });

  return (
    <>
      {activeRoom ? (
        <button
          type="button"
          onClick={() => navigate(`/live/${challengeId}/${activeRoom.roomId}`)}
          className="w-full flex items-center gap-3 rounded-2xl bg-gray-900 p-4 text-left hover:bg-gray-800 transition-colors"
        >
          <span className="relative flex h-3 w-3 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">
              🎙 {activeRoom.title || '음성방'} 진행 중
            </p>
            <p className="text-[11px] text-white/50 mt-0.5">
              {activeRoom.recording ? '🔴 녹음되는 방' : '🔒 저장 안 함 방'} · 탭해서 입장
            </p>
          </div>
          <span className="text-white/60 text-sm">→</span>
        </button>
      ) : canHost ? (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-full py-3 rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors"
        >
          🎙 음성방 열기
        </button>
      ) : null}

      {/* 개설 시트 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 text-center">🎙 음성방 열기</h3>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="방 이름 (선택) — 예: 오늘의 회고 나눔"
              className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm outline-none focus:border-primary-400"
            />

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700">저장 여부 — 개설 후 바꿀 수 없어요</p>
              <button
                type="button"
                onClick={() => setRecording(true)}
                className={`w-full rounded-xl border p-3 text-left ${recording ? 'border-primary-400 bg-primary-50' : 'border-gray-200'}`}
              >
                <p className="text-sm font-bold text-gray-900">🔴 저장함 (기본)</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  대화가 녹음되고 개설자만 원본을 보관·다운로드해요. 참여자는 입장 전 녹음에 동의해요.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setRecording(false)}
                className={`w-full rounded-xl border p-3 text-left ${!recording ? 'border-primary-400 bg-primary-50' : 'border-gray-200'}`}
              >
                <p className="text-sm font-bold text-gray-900">🔒 저장 안 함 (오프더레코드)</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  대화·채팅 모두 어디에도 남지 않아요. 참여자에게 무단 녹음·유포 금지 경고가 표시돼요.
                </p>
              </button>
            </div>

            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="w-full py-3.5 rounded-2xl bg-primary-600 text-white text-sm font-bold disabled:opacity-60"
            >
              {createMutation.isPending ? '여는 중...' : '방 열기'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="w-full py-3 rounded-2xl bg-gray-100 text-gray-500 text-sm font-medium"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 운영탭 — 음성방 이력 + 녹음 원본 관리 (리더·매니저).
 * 다운로드/삭제는 개설자 본인 방만 가능(서버 강제).
 */
export function LiveHistorySection({ challengeId }: { challengeId: string }) {
  const { data: rooms = [] } = useQuery({
    queryKey: ['live-history', challengeId],
    enabled: Boolean(challengeId),
    staleTime: 60 * 1000,
    queryFn: () => liveApi.getHistory(challengeId),
  });

  if (rooms.length === 0) return null;
  return (
    <section className="bg-white rounded-2xl p-4 border border-gray-100 space-y-2">
      <h3 className="text-sm font-bold text-gray-900">🎙 음성방 이력</h3>
      {rooms.map((r) => (
        <div key={r.roomId} className="rounded-xl border border-gray-100 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-gray-800 truncate flex-1">
              {r.title || '음성방'}
            </p>
            <span className="text-[10px] text-gray-400">
              {new Date(r.startedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.status === 'live' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
              {r.status === 'live' ? '진행 중' : '종료'}
            </span>
          </div>
          <p className="text-[10px] text-gray-400">
            {r.recording ? '🔴 저장 방' : '🔒 오프더레코드'}
            {r.recording && !r.hasRecording && r.status === 'ended' && ' · 보관된 녹음 없음'}
          </p>
          {r.recording && r.hasRecording && r.isHost && (
            <LiveRecordingManager challengeId={challengeId} roomId={r.roomId} />
          )}
        </div>
      ))}
    </section>
  );
}

/**
 * 종료된 저장 방 녹음 관리 — 운영탭(개설자·리더용). 원본 다운로드 링크 + 삭제.
 */
export function LiveRecordingManager({ challengeId, roomId }: { challengeId: string; roomId: string }) {
  const [files, setFiles] = useState<LiveRecordingFile[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      setFiles(await liveApi.getRecordingFiles(challengeId, roomId));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '녹음 목록을 불러오지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('녹음 원본을 삭제할까요? 되돌릴 수 없어요.')) return;
    setBusy(true);
    try {
      await liveApi.deleteRecording(challengeId, roomId);
      setFiles([]);
      toast.success('녹음 원본을 삭제했어요');
    } catch {
      toast.error('삭제에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-2">
      {files === null ? (
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="text-xs font-semibold text-primary-600 underline underline-offset-2 disabled:opacity-50"
        >
          🎧 녹음 원본 보기
        </button>
      ) : files.length === 0 ? (
        <p className="text-xs text-gray-400">보관된 녹음이 없어요.</p>
      ) : (
        <>
          {files.map((f) => (
            <a
              key={f.key}
              href={f.downloadUrl}
              download
              className="block text-xs font-semibold text-primary-600 underline underline-offset-2"
            >
              ⬇️ 원본 다운로드 {files.length > 1 ? `(파트 ${f.partIndex})` : ''}
            </a>
          ))}
          <button type="button" onClick={remove} disabled={busy} className="text-[11px] text-red-500 underline underline-offset-2 disabled:opacity-50">
            원본 삭제
          </button>
        </>
      )}
    </div>
  );
}
