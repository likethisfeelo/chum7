/**
 * chat-api — WebSocket 핸들러. 챌린지 단체 채팅 + 1:1 리더 DM(읽음/안읽음).
 * 라우트: $connect · $disconnect · sendMessage · $default(history/read).
 * 방 구분: 그룹=challengeId, DM=`dm#<challengeId>#<participantId>` (쿼리 `?dm=<challengeId>:<participantId>`).
 * 신원: 리더='챌린지 리더', 참여자=일일 반익명(createDailyAnonymousId).
 */
import { randomUUID } from 'node:crypto';
import { createDailyAnonymousId } from '@chum7/core';
import { verifyToken } from './auth';
import { getChatEligibility, getDmEligibility } from './challenges';
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
  type ChatMessage,
} from './repo/chat';
import { broadcast, callbackEndpoint, sendTo } from './broadcast';

const MAX_TEXT_LENGTH = 1000;
const dmRoomKey = (challengeId: string, participantId: string) =>
  `dm#${challengeId}#${participantId}`;
const isDmRoom = (roomKey: string) => roomKey.startsWith('dm#');

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
        await removeConnection(connectionId);
        return okResult;
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

async function onSendMessage(event: WsEvent): Promise<WsResult> {
  const { connectionId, domainName, stage } = event.requestContext;
  const meta = await getConnectionMeta(connectionId);
  if (!meta) return okResult;

  const text = parseText(event.body);
  if (!text) return okResult;

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

/** $default — {action:'history'}(접속 직후) / {action:'read'}(DM 읽음). */
async function onDefault(event: WsEvent): Promise<WsResult> {
  const { connectionId, domainName, stage } = event.requestContext;
  const action = parseAction(event.body);
  const meta = await getConnectionMeta(connectionId);
  if (!meta) return okResult;
  const endpoint = callbackEndpoint(domainName, stage);
  const dm = isDmRoom(meta.roomKey);

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
