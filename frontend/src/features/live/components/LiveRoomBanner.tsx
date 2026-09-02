import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { liveApi, type LiveRecordingFile, type LiveRoom } from '../api/liveApi';

/**
 * 챌린지 라이브 배너 — 열린 방 상태에 따라 3가지로 렌더된다.
 *  live      : 🔴 진행 중 → 탭해서 입장
 *  scheduled : 🗓 예정 (개설자·리더·매니저는 '지금 시작' 버튼, 참여자는 알림 안내)
 *  none      : (리더·매니저) 🎙 열기 → 개설 시트(즉시/예약 + 저장 여부)
 * variant='top' 은 피드 상단 고정 헤더용 얇은 스트립. 'card'(기본)는 상세 페이지용 카드.
 */

function formatKst(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** datetime-local 입력값(로컬 시각) → ISO. 브라우저 로컬 타임존 기준 */
function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** datetime-local 기본값 — 지금 + 1시간, 분은 0으로 */
function defaultScheduleInput(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function LiveRoomBanner({
  challengeId,
  canHost,
  variant = 'card',
}: {
  challengeId: string;
  canHost: boolean;
  variant?: 'card' | 'top';
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [recording, setRecording] = useState(true); // 제품 결정: 기본 저장함
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [scheduleInput, setScheduleInput] = useState(defaultScheduleInput);

  const { data: openRoom } = useQuery({
    queryKey: ['live-active', challengeId],
    enabled: Boolean(challengeId),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: () => liveApi.getActiveRoom(challengeId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['live-active', challengeId] });

  const createMutation = useMutation({
    mutationFn: () =>
      liveApi.createRoom(challengeId, {
        recording,
        title: title.trim() || undefined,
        ...(when === 'later' ? { scheduledAt: localInputToIso(scheduleInput) } : {}),
      }),
    onSuccess: (room) => {
      setShowCreate(false);
      invalidate();
      if (room.status === 'scheduled') {
        toast.success('방을 예약했어요. 참여자에게 예정 알림을 보냈어요');
      } else {
        navigate(`/live/${challengeId}/${room.roomId}`);
      }
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      if (data?.error === 'LIVE_ROOM_EXISTS' && data?.data?.roomId) {
        invalidate();
        setShowCreate(false);
        if (data.data.status === 'live') navigate(`/live/${challengeId}/${data.data.roomId}`);
        else toast('이미 예약된 방이 있어요');
        return;
      }
      toast.error(data?.message || '방을 열지 못했어요');
    },
  });

  const startMutation = useMutation({
    mutationFn: (roomId: string) => liveApi.startRoom(challengeId, roomId),
    onSuccess: (room) => {
      invalidate();
      toast.success('방을 시작했어요. 참여자에게 알림을 보냈어요');
      navigate(`/live/${challengeId}/${room.roomId}`);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '시작하지 못했어요'),
  });

  const top = variant === 'top';

  // ── 진행 중 ──────────────────────────────────────────────────────────
  const liveView = (room: LiveRoom) => (
    <button
      type="button"
      onClick={() => navigate(`/live/${challengeId}/${room.roomId}`)}
      className={
        top
          ? 'w-full flex items-center gap-2.5 rounded-xl bg-gray-900 px-3 py-2 text-left hover:bg-gray-800 transition-colors'
          : 'w-full flex items-center gap-3 rounded-2xl bg-gray-900 p-4 text-left hover:bg-gray-800 transition-colors'
      }
    >
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
      </span>
      <div className="flex-1 min-w-0">
        <p className={`font-bold text-white truncate ${top ? 'text-xs' : 'text-sm'}`}>
          🎙 {room.title || '음성방'} 진행 중 — 지금 입장
        </p>
        {!top && (
          <p className="text-[11px] text-white/50 mt-0.5">
            {room.recording ? '🔴 녹음되는 방' : '🔒 저장 안 함 방'} · 최대 {room.maxParticipants}명
          </p>
        )}
      </div>
      <span className="text-white/60 text-sm">→</span>
    </button>
  );

  // ── 예정 ─────────────────────────────────────────────────────────────
  const scheduledView = (room: LiveRoom) => (
    <div
      className={
        top
          ? 'w-full flex items-center gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2'
          : 'w-full rounded-2xl bg-amber-50 border border-amber-200 p-4'
      }
    >
      <div className={top ? 'flex-1 min-w-0 flex items-center gap-2' : 'flex items-start gap-3'}>
        <span className={top ? 'text-sm' : 'text-2xl'}>🗓</span>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-amber-900 truncate ${top ? 'text-xs' : 'text-sm'}`}>
            {room.title || '음성방'} · {formatKst(room.scheduledAt)} 예정
          </p>
          {!top && (
            <p className="text-[11px] text-amber-700/80 mt-0.5">
              {room.recording ? '🔴 녹음되는 방' : '🔒 저장 안 함 방'} · 시작되면 알림으로 알려드릴게요
            </p>
          )}
        </div>
      </div>
      {canHost && (
        <button
          type="button"
          onClick={() => startMutation.mutate(room.roomId)}
          disabled={startMutation.isPending}
          className={`flex-shrink-0 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors disabled:opacity-60 ${
            top ? 'px-3 py-1.5 text-[11px]' : 'mt-3 w-full py-2.5 text-sm'
          }`}
        >
          {startMutation.isPending ? '시작 중...' : '▶ 지금 시작'}
        </button>
      )}
    </div>
  );

  // ── 없음 (개설) ───────────────────────────────────────────────────────
  const emptyView = canHost ? (
    <button
      type="button"
      onClick={() => setShowCreate(true)}
      className={
        top
          ? 'w-full flex items-center gap-2 rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-left hover:border-gray-400 transition-colors'
          : 'w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-gray-900 to-gray-700 p-4 text-left shadow-md hover:from-gray-800 hover:to-gray-600 transition-colors'
      }
    >
      {top ? (
        <>
          <span className="text-sm">🎙</span>
          <span className="text-xs font-semibold text-gray-700 flex-1">음성방 열기 · 지금 또는 예약</span>
          <span className="text-gray-400 text-xs">→</span>
        </>
      ) : (
        <>
          <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-xl flex-shrink-0">🎙</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">음성방 열기</p>
            <p className="text-[11px] text-white/60 mt-0.5">지금 바로 또는 예약 · 참여자에게 알림 · 최대 10명</p>
          </div>
          <span className="text-white/60 text-sm">→</span>
        </>
      )}
    </button>
  ) : null;

  return (
    <>
      {openRoom?.status === 'live'
        ? liveView(openRoom)
        : openRoom?.status === 'scheduled'
          ? scheduledView(openRoom)
          : emptyView}

      {/* 개설 시트 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div
            className="bg-white rounded-t-3xl w-full max-w-md p-6 space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 text-center">🎙 음성방 열기</h3>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="방 이름 (선택) — 예: 오늘의 회고 나눔"
              className="w-full rounded-xl border border-gray-200 px-3.5 py-3 text-sm outline-none focus:border-primary-400"
            />

            {/* 언제 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700">언제 열까요?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWhen('now')}
                  className={`rounded-xl border p-3 text-left ${when === 'now' ? 'border-primary-400 bg-primary-50' : 'border-gray-200'}`}
                >
                  <p className="text-sm font-bold text-gray-900">▶ 지금 바로</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">바로 방이 열리고 참여자에게 시작 알림</p>
                </button>
                <button
                  type="button"
                  onClick={() => setWhen('later')}
                  className={`rounded-xl border p-3 text-left ${when === 'later' ? 'border-primary-400 bg-primary-50' : 'border-gray-200'}`}
                >
                  <p className="text-sm font-bold text-gray-900">🗓 예약</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">예정 알림 발송 · 시작은 직접 눌러요</p>
                </button>
              </div>
              {when === 'later' && (
                <div className="rounded-xl border border-gray-200 p-3 space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-600" htmlFor="live-schedule-at">
                    예정 시각 (내 로컬 시간)
                  </label>
                  <input
                    id="live-schedule-at"
                    type="datetime-local"
                    value={scheduleInput}
                    min={defaultScheduleInput().slice(0, 16)}
                    onChange={(e) => setScheduleInput(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400"
                  />
                  <p className="text-[10px] text-gray-400">
                    예정 시각이 되어도 자동으로 열리지 않아요 — 이 배너의 '지금 시작'을 눌러 시작합니다.
                  </p>
                </div>
              )}
            </div>

            {/* 저장 여부 */}
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
              disabled={createMutation.isPending || (when === 'later' && !localInputToIso(scheduleInput))}
              className="w-full py-3.5 rounded-2xl bg-primary-600 text-white text-sm font-bold disabled:opacity-60"
            >
              {createMutation.isPending ? '처리 중...' : when === 'later' ? '예약하기' : '방 열기'}
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
  const statusLabel = (s: LiveRoom['status']) => (s === 'live' ? '진행 중' : s === 'scheduled' ? '예정' : '종료');
  const statusClass = (s: LiveRoom['status']) =>
    s === 'live' ? 'bg-red-50 text-red-600' : s === 'scheduled' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500';

  return (
    <section className="bg-white rounded-2xl p-4 border border-gray-100 space-y-2">
      <h3 className="text-sm font-bold text-gray-900">🎙 음성방 이력</h3>
      {rooms.map((r) => (
        <div key={r.roomId} className="rounded-xl border border-gray-100 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-gray-800 truncate flex-1">{r.title || '음성방'}</p>
            <span className="text-[10px] text-gray-400">{formatKst(r.startedAt ?? r.scheduledAt)}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusClass(r.status)}`}>
              {statusLabel(r.status)}
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
