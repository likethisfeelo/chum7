/**
 * 라이브 방 (클럽하우스형 음성 · Phase 2 리더 방송) — /c/:challengeId/live
 *  POST /                    방 개설 (리더·매니저) — recording 여부는 여기서 확정·불변
 *  GET  /active              진행 중인 방 (참여자 배너용 — 좀비 방은 종료 취급)
 *  GET  /:roomId             방 상세 (참여자)
 *  POST /:roomId/consent     녹음 동의 / 오프더레코드 경고 확인 기록
 *  POST /:roomId/end         방 종료 (개설자·리더·매니저)
 *  POST /:roomId/recording-url        녹음 업로드 presign (개설자 · 저장 방 전용)
 *  POST /:roomId/recording-complete   업로드 완료 키 등록 (개설자)
 *  GET  /:roomId/recording            원본 다운로드 URL 목록 (개설자 전용)
 *  DELETE /:roomId/recording          원본 삭제 (개설자 전용 — 무기한 보관의 삭제 도구)
 * 미디어는 P2P(WebRTC 메시)라 서버를 지나지 않는다. 시그널링은 chat-api WebSocket.
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppEnv, ApiContext } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import {
  liveConsentSchema,
  liveRecordingCompleteSchema,
  liveRecordingUrlSchema,
  liveRoomCreateSchema,
} from '../schemas';
import {
  LIVE_ROOM_MAX_PARTICIPANTS,
  LIVE_ROOM_MAX_SPEAKERS,
  consentKindFor,
  isRoomActive,
  isValidRecordingKey,
} from '../domain/live-rules';
import { getChallenge } from '../repo/challenges';
import { getParticipation } from '../repo/participations';
import {
  addRecordingKey,
  clearRecordingKeys,
  endLiveRoom,
  getLiveRoom,
  listAllLiveRooms,
  listLiveStatusRooms,
  putLiveConsent,
  putLiveRoom,
} from '../repo/live';
import { stripKeys } from '../repo/shared';
import { getTurnIceServers } from '../repo/turn';

export const liveRoutes = new Hono<AppEnv>();

const s3 = new S3Client({});
const EXCLUDED_STATUSES = new Set(['gave_up', 'failed', 'rejected']);

interface RoomAccess {
  challenge: Record<string, any>;
  isHostRole: boolean; // 리더 또는 매니저
}

/** 챌린지 존재 + 호출자 등급 판정. 참여자/리더·매니저가 아니면 error. */
async function resolveAccess(
  c: ApiContext,
  challengeId: string,
  opts?: { hostOnly?: boolean },
): Promise<{ access?: RoomAccess; error?: Response }> {
  const { userId } = c.get('authUser')!;
  const challenge = await getChallenge(challengeId);
  if (!challenge) return { error: fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다') };

  const ownerId = String(challenge.createdBy || challenge.creatorId || challenge.leaderId || '');
  const managerIds: string[] = Array.isArray(challenge.managerIds) ? challenge.managerIds.map(String) : [];
  const isHostRole = (ownerId !== '' && ownerId === userId) || managerIds.includes(userId);

  if (isHostRole) return { access: { challenge, isHostRole } };
  if (opts?.hostOnly) {
    return { error: fail(c, 403, 'FORBIDDEN', '리더·매니저만 사용할 수 있는 기능입니다') };
  }

  const part = await getParticipation(challengeId, userId);
  const joined =
    part &&
    !EXCLUDED_STATUSES.has(String(part.status ?? '')) &&
    String(part.phase ?? '') !== 'gave_up';
  if (!joined) return { error: fail(c, 403, 'NOT_PARTICIPANT', '챌린지 참여자만 이용할 수 있어요') };
  return { access: { challenge, isHostRole: false } };
}

/** 응답용 방 뷰 — 좀비 판정 반영 + 내부 키 제거 */
function roomView(room: Record<string, any>, now: Date): Record<string, any> {
  const active = isRoomActive(room as any, now);
  return {
    ...stripKeys(room),
    status: active ? 'live' : 'ended',
    maxParticipants: LIVE_ROOM_MAX_PARTICIPANTS,
    maxSpeakers: LIVE_ROOM_MAX_SPEAKERS,
  };
}

// ── 방 개설 ─────────────────────────────────────────────────────────────
liveRoutes.post('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId')!;
  const parsed = liveRoomCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다', { details: parsed.error.flatten() });
  }
  const input = parsed.data;
  if (input.mode === 'video') {
    return fail(c, 400, 'MODE_NOT_AVAILABLE', '영상 라이브는 준비 중이에요. 음성방을 이용해주세요');
  }

  const { error } = await resolveAccess(c, challengeId, { hostOnly: true });
  if (error) return error;

  // 챌린지당 진행 중인 방 1개 — 좀비(status live지만 만료)는 무시
  const now = new Date();
  const existing = (await listLiveStatusRooms(challengeId)).find((r) => isRoomActive(r as any, now));
  if (existing) {
    return fail(c, 409, 'LIVE_ROOM_EXISTS', '이미 진행 중인 방이 있어요', {
      data: { roomId: existing.roomId },
    });
  }

  const roomId = randomUUID();
  const nowIso = now.toISOString();
  await putLiveRoom({
    pk: `CHAL#${challengeId}`,
    sk: `LIVE#${roomId}`,
    roomId,
    challengeId,
    mode: input.mode,
    recording: input.recording,
    status: 'live',
    hostUserId: userId,
    title: input.title || null,
    startedAt: nowIso,
    endedAt: null,
    recordingKeys: [],
    createdAt: nowIso,
  });

  // 개설자 본인의 동의도 기록 (저장 방: 녹음 동의 / 오프더레코드: 경고 확인)
  await putLiveConsent({ challengeId, roomId, userId, kind: consentKindFor(input.recording) });

  return ok(c, { room: roomView(await getLiveRoom(challengeId, roomId) ?? {}, now) }, '방을 열었어요');
});

// ── 진행 중인 방 조회 (배너) ─────────────────────────────────────────────
liveRoutes.get('/active', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const { error } = await resolveAccess(c, challengeId);
  if (error) return error;

  const now = new Date();
  const active = (await listLiveStatusRooms(challengeId)).find((r) => isRoomActive(r as any, now));
  return ok(c, { room: active ? roomView(active, now) : null });
});

// ── 방 이력 (운영탭 — 리더·매니저) ───────────────────────────────────────
liveRoutes.get('/history', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const { error } = await resolveAccess(c, challengeId, { hostOnly: true });
  if (error) return error;

  const { userId } = c.get('authUser')!;
  const now = new Date();
  const rooms = (await listAllLiveRooms(challengeId))
    .sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')))
    .slice(0, 10)
    .map((r) => ({
      ...roomView(r, now),
      isHost: String(r.hostUserId) === userId,
      hasRecording: Array.isArray(r.recordingKeys) && r.recordingKeys.length > 0,
    }));
  return ok(c, { rooms });
});

// ── 방 상세 ─────────────────────────────────────────────────────────────
liveRoutes.get('/:roomId', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const roomId = c.req.param('roomId')!;
  const { access, error } = await resolveAccess(c, challengeId);
  if (error) return error;

  const room = await getLiveRoom(challengeId, roomId);
  if (!room) return fail(c, 404, 'LIVE_ROOM_NOT_FOUND', '방을 찾을 수 없습니다');
  const { userId } = c.get('authUser')!;
  // TURN 자격증명은 단기라 방 입장 시점에 발급해 내려준다 (미설정이면 null → 클라이언트는 STUN만)
  const iceServers = await getTurnIceServers();
  return ok(c, {
    room: roomView(room, new Date()),
    isHost: String(room.hostUserId) === userId,
    canManage: access!.isHostRole,
    iceServers,
  });
});

// ── 동의 / 경고 확인 기록 ────────────────────────────────────────────────
liveRoutes.post('/:roomId/consent', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId')!;
  const roomId = c.req.param('roomId')!;
  const parsed = liveConsentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다');

  const { error } = await resolveAccess(c, challengeId);
  if (error) return error;
  const room = await getLiveRoom(challengeId, roomId);
  if (!room) return fail(c, 404, 'LIVE_ROOM_NOT_FOUND', '방을 찾을 수 없습니다');

  // 방의 저장 여부와 동의 종류가 일치해야 기록으로서 의미가 있다
  const expected = consentKindFor(room.recording === true);
  if (parsed.data.kind !== expected) {
    return fail(c, 400, 'CONSENT_KIND_MISMATCH', '이 방에 맞는 동의 유형이 아닙니다');
  }

  await putLiveConsent({ challengeId, roomId, userId, kind: parsed.data.kind });
  return ok(c, { recorded: true });
});

// ── 방 종료 ─────────────────────────────────────────────────────────────
liveRoutes.post('/:roomId/end', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = c.req.param('challengeId')!;
  const roomId = c.req.param('roomId')!;
  const { access, error } = await resolveAccess(c, challengeId);
  if (error) return error;

  const room = await getLiveRoom(challengeId, roomId);
  if (!room) return fail(c, 404, 'LIVE_ROOM_NOT_FOUND', '방을 찾을 수 없습니다');
  const isHost = String(room.hostUserId) === userId;
  if (!isHost && !access!.isHostRole) {
    return fail(c, 403, 'FORBIDDEN', '방 개설자 또는 리더·매니저만 종료할 수 있어요');
  }

  if (room.status === 'live') {
    await endLiveRoom(challengeId, roomId, new Date().toISOString());
  }
  return ok(c, { ended: true }, '방을 종료했어요');
});

// ── 녹음 파이프라인 (저장 방 · 개설자 전용) ───────────────────────────────
async function requireHostRecordingRoom(
  c: ApiContext,
  challengeId: string,
  roomId: string,
): Promise<{ room?: Record<string, any>; error?: Response }> {
  const { userId } = c.get('authUser')!;
  const room = await getLiveRoom(challengeId, roomId);
  if (!room) return { error: fail(c, 404, 'LIVE_ROOM_NOT_FOUND', '방을 찾을 수 없습니다') };
  if (String(room.hostUserId) !== userId) {
    return { error: fail(c, 403, 'FORBIDDEN', '방 개설자만 사용할 수 있는 기능입니다') };
  }
  if (room.recording !== true) {
    return { error: fail(c, 409, 'ROOM_NOT_RECORDED', '저장 안 함(오프더레코드) 방에는 녹음 기능이 없어요') };
  }
  return { room };
}

liveRoutes.post('/:roomId/recording-url', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const roomId = c.req.param('roomId')!;
  const parsed = liveRecordingUrlSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다');
  const { error } = await requireHostRecordingRoom(c, challengeId, roomId);
  if (error) return error;
  if (!process.env.UPLOADS_BUCKET) {
    return fail(c, 500, 'UPLOADS_BUCKET_NOT_CONFIGURED', '업로드 설정이 올바르지 않습니다');
  }

  const ext = parsed.data.contentType.endsWith('mp4') ? 'mp4' : 'webm';
  const key = `live/${challengeId}/${roomId}/part-${Date.now()}-${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.UPLOADS_BUCKET,
      Key: key,
      ContentType: parsed.data.contentType,
    }),
    { expiresIn: 15 * 60 },
  );
  return ok(c, { uploadUrl, key });
});

liveRoutes.post('/:roomId/recording-complete', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const roomId = c.req.param('roomId')!;
  const parsed = liveRecordingCompleteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다');
  const { error } = await requireHostRecordingRoom(c, challengeId, roomId);
  if (error) return error;
  if (!isValidRecordingKey(challengeId, roomId, parsed.data.key)) {
    return fail(c, 400, 'INVALID_RECORDING_KEY', '녹음 파일 키가 올바르지 않습니다');
  }
  await addRecordingKey(challengeId, roomId, parsed.data.key);
  return ok(c, { saved: true });
});

liveRoutes.get('/:roomId/recording', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const roomId = c.req.param('roomId')!;
  const { room, error } = await requireHostRecordingRoom(c, challengeId, roomId);
  if (error) return error;
  if (!process.env.UPLOADS_BUCKET) {
    return fail(c, 500, 'UPLOADS_BUCKET_NOT_CONFIGURED', '업로드 설정이 올바르지 않습니다');
  }

  const keys: string[] = Array.isArray(room!.recordingKeys) ? room!.recordingKeys : [];
  const files = await Promise.all(
    keys.map(async (key, i) => ({
      key,
      partIndex: i + 1,
      downloadUrl: await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: process.env.UPLOADS_BUCKET, Key: key }),
        { expiresIn: 60 * 60 },
      ),
    })),
  );
  return ok(c, { files });
});

liveRoutes.delete('/:roomId/recording', async (c) => {
  const challengeId = c.req.param('challengeId')!;
  const roomId = c.req.param('roomId')!;
  const { room, error } = await requireHostRecordingRoom(c, challengeId, roomId);
  if (error) return error;
  if (!process.env.UPLOADS_BUCKET) {
    return fail(c, 500, 'UPLOADS_BUCKET_NOT_CONFIGURED', '업로드 설정이 올바르지 않습니다');
  }

  const keys: string[] = Array.isArray(room!.recordingKeys) ? room!.recordingKeys : [];
  await Promise.all(
    keys.map((key) =>
      s3
        .send(new DeleteObjectCommand({ Bucket: process.env.UPLOADS_BUCKET, Key: key }))
        .catch((err) => console.error('live recording delete error (non-fatal):', err?.message)),
    ),
  );
  await clearRecordingKeys(challengeId, roomId);
  return ok(c, { deleted: keys.length }, '녹음 원본을 삭제했어요');
});
