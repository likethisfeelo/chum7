/**
 * chat-api — WebSocket 핸들러. 챌린지 단체 채팅 + 1:1 리더 DM(읽음/안읽음) + 라이브 방 시그널링.
 * 라우트: $connect · $disconnect · sendMessage · $default(history/read + live:*).
 * 방 구분: 그룹=challengeId, DM=`dm#...`, 라이브=`live#<challengeId>#<roomId>` (쿼리 `?live=<challengeId>:<roomId>`).
 * 신원: 리더='챌린지 리더', 참여자=일일 반익명(createDailyAnonymousId).
 * 라이브 방 특칙: 미디어는 P2P(서버 미경유), 채팅은 저장 여부와 무관하게 릴레이만 하고
 * DB에 남기지 않는다(오프더레코드 약속 — 방이 닫히면 증발).
 */
import { randomUUID } from 'node:crypto';
import { createDailyAnonymousId } from '@chum7/core';
import { verifyToken } from './auth';
import { getChatEligibility, getDmEligibility } from './challenges';
import { getLiveEligibility, LIVE_ROOM_MAX_PARTICIPANTS, LIVE_ROOM_MAX_SPEAKERS } from './live';
import { loadAnonSalt } from './anon-salt';
import {
  DM_MESSAGE_TTL_SECONDS,
  GROUP_MESSAGE_TTL_SECONDS,
  getConnectionMeta,
  getPeerLastReadAt,
  listRecentMessages,
  listRoomConnections,
  removeConnection,
  saveConnection,
  saveMessage,
  setLastRead,
  updateConnectionRole,
  type ChatMessage,
  type ConnectionMeta,
} from './repo/chat';
import { broadcast, callbackEndpoint, disconnectConnection, sendTo } from './broadcast';

const MAX_TEXT_LENGTH = 1000;
const dmRoomKey = (challengeId: string, participantId: string) =>
  `dm#${challengeId}#${participantId}`;
const isDmRoom = (roomKey: string) => roomKey.startsWith('dm#');
const liveRoomKey = (challengeId: string, roomId: string) => `live#${challengeId}#${roomId}`;
const isLiveRoom = (roomKey: string) => roomKey.startsWith('live#');

interface WsEvent {
  requestContext: {
    routeKey: string;
    connectionId: string;
    domainName: string;
    stage: string;
  };
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
}

interface WsResult {
  statusCode: number;
  body?: string;
}

const okResult: WsResult = { statusCode: 200, body: 'OK' };

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const { routeKey, connectionId } = event.requestContext;
  try {
    switch (routeKey) {
      case '$connect':
        return await onConnect(event);
      case '$disconnect':
        return await onDisconnect(event);
      case 'sendMessage':
        return await onSendMessage(event);
      default:
        return await onDefault(event);
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'chat-api',
        routeKey,
        connectionId,
        name: (err as Error).name,
        message: (err as Error).message,
      }),
    );
    return routeKey === '$connect' ? { statusCode: 500, body: 'ERROR' } : okResult;
  }
};

async function onConnect(event: WsEvent): Promise<WsResult> {
  const { connectionId } = event.requestContext;
  const qs = event.queryStringParameters ?? {};
  const token = qs.token;
  if (!token) return { statusCode: 400, body: 'MISSING_PARAMS' };

  let userId: string;
  try {
    ({ userId } = await verifyToken(token));
  } catch {
    return { statusCode: 401, body: 'UNAUTHORIZED' };
  }

  const salt = () => loadAnonSalt();

  // ── 라이브 방 (?live=<challengeId>:<roomId>) ──
  if (qs.live) {
    const [challengeId, roomId] = String(qs.live).split(':');
    if (!challengeId || !roomId) return { statusCode: 400, body: 'MISSING_PARAMS' };
    const { eligible, isLeader, isHost } = await getLiveEligibility(challengeId, roomId, userId);
    if (!eligible) return { statusCode: 403, body: 'FORBIDDEN' };

    const roomKey = liveRoomKey(challengeId, roomId);
    // 동시 인원 상한 — 같은 유저의 이전 연결(새로고침 잔재)은 상한 집계에서 제외
    const existing = await listRoomConnections(roomKey);
    const others = existing.filter((conn) => conn.userId !== userId);
    if (others.length >= LIVE_ROOM_MAX_PARTICIPANTS) {
      return { statusCode: 403, body: 'ROOM_FULL' };
    }

    const displayName = isLeader
      ? '챌린지 리더'
      : createDailyAnonymousId(challengeId, userId, await salt());
    await saveConnection(
      roomKey,
      {
        connectionId,
        userId,
        displayName,
        isLeader,
        // 개설자·리더는 바로 스피커, 그 외엔 리스너로 입장 (✋ 손들기 → 개설자가 승급)
        role: isHost || isLeader ? 'speaker' : 'listener',
        isHost,
      },
      Date.now(),
    );
    return okResult;
  }

  // ── 1:1 리더 DM (?dm=<challengeId>:<participantId>) ──
  if (qs.dm) {
    const [challengeId, participantId] = String(qs.dm).split(':');
    if (!challengeId || !participantId) return { statusCode: 400, body: 'MISSING_PARAMS' };
    const { eligible, isLeader } = await getDmEligibility(challengeId, userId, participantId);
    if (!eligible) return { statusCode: 403, body: 'FORBIDDEN' };
    const displayName = isLeader
      ? '챌린지 리더'
      : createDailyAnonymousId(challengeId, userId, await salt());
    await saveConnection(
      dmRoomKey(challengeId, participantId),
      { connectionId, userId, displayName, isLeader },
      Date.now(),
    );
    return okResult;
  }

  // ── 챌린지 단체 채팅 (?challengeId=) ──
  const challengeId = qs.challengeId;
  if (!challengeId) return { statusCode: 400, body: 'MISSING_PARAMS' };
  const { eligible, isLeader } = await getChatEligibility(challengeId, userId);
  if (!eligible) return { statusCode: 403, body: 'FORBIDDEN' };
  const displayName = isLeader
    ? '챌린지 리더'
    : createDailyAnonymousId(challengeId, userId, await salt());
  await saveConnection(
    challengeId,
    { connectionId, userId, displayName, isLeader },
    Date.now(),
  );
  return okResult;
}

/** $disconnect — 연결 정리 + 라이브 방이면 남은 참여자에게 이탈 통지. */
async function onDisconnect(event: WsEvent): Promise<WsResult> {
  const { connectionId, domainName, stage } = event.requestContext;
  const meta = await getConnectionMeta(connectionId);
  await removeConnection(connectionId);
  if (meta && isLiveRoom(meta.roomKey)) {
    const endpoint = callbackEndpoint(domainName, stage);
    const remaining = await listRoomConnections(meta.roomKey);
    await broadcast(endpoint, meta.roomKey, remaining, {
      type: 'live:peer-left',
      connectionId,
    });
  }
  return okResult;
}

async function onSendMessage(event: WsEvent): Promise<WsResult> {
  const { connectionId, domainName, stage } = event.requestContext;
  const meta = await getConnectionMeta(connectionId);
  if (!meta) return okResult;

  const text = parseText(event.body);
  if (!text) return okResult;

  // 라이브 방 채팅 — 저장 없이 릴레이만 (방이 닫히면 증발, 오프더레코드 약속과 일관)
  if (isLiveRoom(meta.roomKey)) {
    const endpoint = callbackEndpoint(domainName, stage);
    const connections = await listRoomConnections(meta.roomKey);
    await broadcast(endpoint, meta.roomKey, connections, {
      type: 'live:chat',
      message: {
        messageId: randomUUID(),
        displayName: meta.displayName,
        text,
        createdAt: new Date().toISOString(),
        isLeader: meta.isLeader,
        isHost: meta.isHost === true,
      },
    });
    return okResult;
  }

  const now = Date.now();
  const message: ChatMessage = {
    messageId: randomUUID(),
    displayName: meta.displayName,
    text,
    createdAt: new Date(now).toISOString(),
    isLeader: meta.isLeader,
  };
  const ttl = isDmRoom(meta.roomKey) ? DM_MESSAGE_TTL_SECONDS : GROUP_MESSAGE_TTL_SECONDS;
  await saveMessage(meta.roomKey, connectionId, message, now, ttl);

  const endpoint = callbackEndpoint(domainName, stage);
  const connections = await listRoomConnections(meta.roomKey);
  await broadcast(endpoint, meta.roomKey, connections, { type: 'message', message });
  return okResult;
}

/** $default — {action:'history'}(접속 직후) / {action:'read'}(DM 읽음) / live:* 시그널링. */
async function onDefault(event: WsEvent): Promise<WsResult> {
  const { connectionId, domainName, stage } = event.requestContext;
  const action = parseAction(event.body);
  const meta = await getConnectionMeta(connectionId);
  if (!meta) return okResult;
  const endpoint = callbackEndpoint(domainName, stage);
  const dm = isDmRoom(meta.roomKey);

  if (isLiveRoom(meta.roomKey)) {
    return await onLiveAction(event, meta, endpoint, action);
  }

  if (action === 'history') {
    const messages = await listRecentMessages(meta.roomKey);
    let peerLastReadAt: string | null = null;
    if (dm) {
      const nowIso = new Date().toISOString();
      await setLastRead(meta.roomKey, meta.userId, nowIso);
      peerLastReadAt = await getPeerLastReadAt(meta.roomKey, meta.userId);
      await broadcastRead(endpoint, meta.roomKey, meta.userId, nowIso);
    }
    await sendTo(
      endpoint,
      connectionId,
      {
        type: 'ready',
        displayName: meta.displayName,
        isLeader: meta.isLeader,
        isDm: dm,
        peerLastReadAt,
        messages,
      },
      meta.roomKey,
    );
    return okResult;
  }

  if (action === 'read' && dm) {
    const nowIso = new Date().toISOString();
    await setLastRead(meta.roomKey, meta.userId, nowIso);
    await broadcastRead(endpoint, meta.roomKey, meta.userId, nowIso);
    return okResult;
  }

  return okResult;
}

/**
 * 라이브 방 액션 라우팅.
 *  history            → live:ready(내 정보+로스터) 응답 + 다른 참여자에게 live:peer-joined
 *  live:signal        → WebRTC offer/answer/ICE를 대상 연결로 릴레이 (내용 무해석)
 *  live:hand          → ✋ 손들기 상태 브로드캐스트
 *  live:role          → (개설자) 스피커/리스너 변경 — 스피커 상한 강제
 *  live:mute          → (개설자) 대상에게 뮤트 요청 릴레이 (클라이언트가 마이크 끔)
 *  live:kick          → (개설자) 강제 퇴장 — 통지 후 연결 종료
 *  live:end           → (개설자) 종료 브로드캐스트 (방 상태 변경은 REST가 담당)
 */
async function onLiveAction(
  event: WsEvent,
  meta: ConnectionMeta,
  endpoint: string,
  action: string | undefined,
): Promise<WsResult> {
  const { connectionId } = event.requestContext;
  const body = parseBody(event.body);
  const roomKey = meta.roomKey;
  const canControl = meta.isHost === true || meta.isLeader === true;

  if (action === 'history') {
    const connections = await listRoomConnections(roomKey);
    const roster = connections.map((c2) => ({
      connectionId: c2.connectionId,
      displayName: c2.displayName,
      isLeader: c2.isLeader,
      isHost: c2.isHost === true,
      role: c2.role === 'speaker' ? 'speaker' : 'listener',
      isMe: c2.connectionId === connectionId,
    }));
    await sendTo(
      endpoint,
      connectionId,
      {
        type: 'live:ready',
        connectionId,
        displayName: meta.displayName,
        isLeader: meta.isLeader,
        isHost: meta.isHost === true,
        role: meta.role === 'speaker' ? 'speaker' : 'listener',
        maxParticipants: LIVE_ROOM_MAX_PARTICIPANTS,
        maxSpeakers: LIVE_ROOM_MAX_SPEAKERS,
        roster,
      },
      roomKey,
    );
    // 나 이외에게 입장 통지 — 기존 피어들은 이걸 받고 신규 연결의 offer를 기다린다
    const me = roster.find((r) => r.isMe);
    await Promise.all(
      connections
        .filter((c2) => c2.connectionId !== connectionId)
        .map((c2) =>
          sendTo(endpoint, c2.connectionId, { type: 'live:peer-joined', peer: me }, roomKey).catch(
            () => undefined,
          ),
        ),
    );
    return okResult;
  }

  if (action === 'live:signal') {
    const target = typeof body.target === 'string' ? body.target : '';
    const payload = body.payload;
    if (!target || payload === undefined) return okResult;
    await sendTo(
      endpoint,
      target,
      { type: 'live:signal', from: connectionId, payload },
      roomKey,
    ).catch(() => undefined);
    return okResult;
  }

  if (action === 'live:hand') {
    const raised = body.raised === true;
    const connections = await listRoomConnections(roomKey);
    await broadcast(endpoint, roomKey, connections, {
      type: 'live:hand',
      connectionId,
      displayName: meta.displayName,
      raised,
    });
    return okResult;
  }

  if (action === 'live:role') {
    if (!canControl) return okResult;
    const target = typeof body.target === 'string' ? body.target : '';
    const role = body.role === 'speaker' ? 'speaker' : body.role === 'listener' ? 'listener' : null;
    if (!target || !role) return okResult;
    const connections = await listRoomConnections(roomKey);
    if (role === 'speaker') {
      const speakers = connections.filter((c2) => c2.role === 'speaker' && c2.connectionId !== target);
      if (speakers.length >= LIVE_ROOM_MAX_SPEAKERS) {
        await sendTo(
          endpoint,
          connectionId,
          { type: 'live:error', code: 'SPEAKER_LIMIT', message: `스피커는 최대 ${LIVE_ROOM_MAX_SPEAKERS}명이에요` },
          roomKey,
        ).catch(() => undefined);
        return okResult;
      }
    }
    await updateConnectionRole(roomKey, target, role).catch(() => undefined);
    await broadcast(endpoint, roomKey, connections, { type: 'live:role', connectionId: target, role });
    return okResult;
  }

  if (action === 'live:mute') {
    if (!canControl) return okResult;
    const target = typeof body.target === 'string' ? body.target : '';
    if (!target) return okResult;
    await sendTo(endpoint, target, { type: 'live:mute' }, roomKey).catch(() => undefined);
    return okResult;
  }

  if (action === 'live:kick') {
    if (!canControl) return okResult;
    const target = typeof body.target === 'string' ? body.target : '';
    if (!target || target === connectionId) return okResult;
    await sendTo(endpoint, target, { type: 'live:kicked' }, roomKey).catch(() => undefined);
    await disconnectConnection(endpoint, target);
    return okResult; // 이후 $disconnect가 정리·peer-left 통지
  }

  if (action === 'live:end') {
    if (!canControl) return okResult;
    const connections = await listRoomConnections(roomKey);
    await broadcast(endpoint, roomKey, connections, { type: 'live:ended' });
    return okResult;
  }

  return okResult;
}

/** 상대(나 이외)에게 읽음 통지 — 보낸 메시지 '읽음' 표시용. */
async function broadcastRead(
  endpoint: string,
  roomKey: string,
  readerUserId: string,
  at: string,
): Promise<void> {
  const connections = await listRoomConnections(roomKey);
  await Promise.all(
    connections
      .filter((c) => c.userId !== readerUserId)
      .map((c) =>
        sendTo(endpoint, c.connectionId, { type: 'read', at }, roomKey).catch(() => undefined),
      ),
  );
}

function parseBody(body?: string | null): Record<string, unknown> {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseAction(body?: string | null): string | undefined {
  const action = parseBody(body).action;
  return typeof action === 'string' ? action : undefined;
}

function parseText(body?: string | null): string | undefined {
  const text = parseBody(body).text;
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_TEXT_LENGTH);
}
