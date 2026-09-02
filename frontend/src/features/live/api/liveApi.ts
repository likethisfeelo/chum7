import { apiClient } from '@/lib/api-client';

/**
 * 라이브 방 REST — challenge-api /c/:challengeId/live (미디어는 P2P, 여긴 수명주기만).
 * recording(저장 여부)은 개설 시 확정·불변. 오프더레코드 방은 서버에 아무것도 남지 않는다.
 */

export interface LiveRoom {
  roomId: string;
  challengeId: string;
  mode: 'audio' | 'video';
  recording: boolean;
  status: 'live' | 'ended';
  hostUserId: string;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  recordingKeys?: string[];
  maxParticipants: number;
  maxSpeakers: number;
}

export interface LiveRecordingFile {
  key: string;
  partIndex: number;
  downloadUrl: string;
}

export const liveApi = {
  async createRoom(challengeId: string, params: { recording: boolean; title?: string }): Promise<LiveRoom> {
    const res = await apiClient.post(`/c/${challengeId}/live`, { mode: 'audio', ...params });
    return res.data.data.room as LiveRoom;
  },

  async getActiveRoom(challengeId: string): Promise<LiveRoom | null> {
    const res = await apiClient.get(`/c/${challengeId}/live/active`);
    return (res.data.data.room ?? null) as LiveRoom | null;
  },

  async getHistory(
    challengeId: string,
  ): Promise<(LiveRoom & { isHost: boolean; hasRecording: boolean })[]> {
    const res = await apiClient.get(`/c/${challengeId}/live/history`);
    return res.data.data.rooms;
  },

  async getRoom(
    challengeId: string,
    roomId: string,
  ): Promise<{ room: LiveRoom; isHost: boolean; canManage: boolean }> {
    const res = await apiClient.get(`/c/${challengeId}/live/${roomId}`);
    return res.data.data;
  },

  /** 입장 전 동의/경고확인 기록 — 저장 방: record_consent, 오프더레코드: offrecord_ack */
  async recordConsent(
    challengeId: string,
    roomId: string,
    kind: 'record_consent' | 'offrecord_ack',
  ): Promise<void> {
    await apiClient.post(`/c/${challengeId}/live/${roomId}/consent`, { kind });
  },

  async endRoom(challengeId: string, roomId: string): Promise<void> {
    await apiClient.post(`/c/${challengeId}/live/${roomId}/end`, {});
  },

  async getRecordingUploadUrl(
    challengeId: string,
    roomId: string,
    contentType: string,
    fileSize: number,
  ): Promise<{ uploadUrl: string; key: string }> {
    const res = await apiClient.post(`/c/${challengeId}/live/${roomId}/recording-url`, {
      contentType,
      fileSize,
    });
    return res.data.data;
  },

  async completeRecording(challengeId: string, roomId: string, key: string): Promise<void> {
    await apiClient.post(`/c/${challengeId}/live/${roomId}/recording-complete`, { key });
  },

  async getRecordingFiles(challengeId: string, roomId: string): Promise<LiveRecordingFile[]> {
    const res = await apiClient.get(`/c/${challengeId}/live/${roomId}/recording`);
    return res.data.data.files as LiveRecordingFile[];
  },

  async deleteRecording(challengeId: string, roomId: string): Promise<void> {
    await apiClient.delete(`/c/${challengeId}/live/${roomId}/recording`);
  },
};
