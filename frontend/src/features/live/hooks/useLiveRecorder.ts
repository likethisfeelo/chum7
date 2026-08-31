import { useCallback, useEffect, useRef, useState } from 'react';
import { liveApi } from '../api/liveApi';

/**
 * 개설자 단 녹음 — 서버 녹음 장비 없이 원본을 만든다 (저장 방 전용).
 * 내 마이크 + 모든 피어 스트림을 Web Audio로 믹스해 MediaRecorder로 녹음하고,
 * 종료 시 presign 업로드 → 방 레코드에 키 등록. 개설자만 다운로드 가능.
 * 한계(문서화): 개설자 탭이 닫히면 업로드 못 한 구간은 유실된다.
 */

export type RecorderState = 'idle' | 'recording' | 'uploading' | 'done' | 'error';

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // 무시
    }
  }
  return null;
}

export function useLiveRecorder(params: {
  enabled: boolean; // 개설자 && 저장 방 && 입장 완료
  challengeId: string | undefined;
  roomId: string | undefined;
  localStream: MediaStream | null;
  peerStreams: MediaStream[];
}) {
  const { enabled, challengeId, roomId, localStream, peerStreams } = params;
  const [recState, setRecState] = useState<RecorderState>('idle');

  const ctxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>('audio/webm');
  const connectedRef = useRef<Set<string>>(new Set());
  const uploadedRef = useRef(false);

  // ── 녹음 시작 (1회) ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || recorderRef.current) return;
    const mime = pickMimeType();
    if (!mime) {
      setRecState('error');
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      const dest = ctx.createMediaStreamDestination();
      ctxRef.current = ctx;
      destRef.current = dest;

      const recorder = new MediaRecorder(dest.stream, { mimeType: mime });
      mimeRef.current = mime.split(';')[0] || 'audio/webm';
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(10_000); // 10초 단위 청크 — 긴 세션 메모리 분할
      recorderRef.current = recorder;
      setRecState('recording');
    } catch {
      setRecState('error');
    }

    return () => {
      // 언마운트 시 리소스만 정리 (업로드는 stopAndUpload가 담당)
      try {
        recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop();
      } catch {
        // 무시
      }
      recorderRef.current = null;
      ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
      destRef.current = null;
      connectedRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ── 스트림 믹스 — 새 스트림이 생길 때마다 연결 ─────────────────────────
  useEffect(() => {
    const ctx = ctxRef.current;
    const dest = destRef.current;
    if (!ctx || !dest || recState !== 'recording') return;

    const attach = (stream: MediaStream | null) => {
      if (!stream || connectedRef.current.has(stream.id)) return;
      if (stream.getAudioTracks().length === 0) return;
      try {
        ctx.createMediaStreamSource(stream).connect(dest);
        connectedRef.current.add(stream.id);
      } catch {
        // 이미 종료된 스트림 등 — 무시
      }
    };
    attach(localStream);
    peerStreams.forEach(attach);
  }, [localStream, peerStreams, recState]);

  // ── 종료 + 업로드 ─────────────────────────────────────────────────────
  const stopAndUpload = useCallback(async (): Promise<boolean> => {
    const recorder = recorderRef.current;
    if (!challengeId || !roomId) return false;
    if (uploadedRef.current) return true;
    if (!recorder) return false;

    setRecState('uploading');
    // stop → 마지막 dataavailable 플러시를 기다린다
    await new Promise<void>((resolve) => {
      if (recorder.state === 'inactive') return resolve();
      recorder.onstop = () => resolve();
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });

    const blob = new Blob(chunksRef.current, { type: mimeRef.current });
    if (blob.size === 0) {
      setRecState('error');
      return false;
    }
    try {
      const { uploadUrl, key } = await liveApi.getRecordingUploadUrl(
        challengeId,
        roomId,
        mimeRef.current,
        blob.size,
      );
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeRef.current },
        body: blob,
      });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      await liveApi.completeRecording(challengeId, roomId, key);
      uploadedRef.current = true;
      chunksRef.current = [];
      setRecState('done');
      return true;
    } catch {
      setRecState('error');
      return false;
    }
  }, [challengeId, roomId]);

  return { recState, stopAndUpload };
}
