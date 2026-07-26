/**
 * chat-api — 챌린지 단체 채팅 WebSocket 핸들러 (API Gateway WebSocket API).
 * 라우트: $connect(참여자 검증) · $disconnect(정리) · sendMessage(브로드캐스트) · $default(history).
 * routeSelectionExpression = `$request.body.action` → 클라이언트는 {action, ...} 전송.
 * 신원: 마당/인증글과 동일한 일일 반익명 활동명(createDailyAnonymousId) 재사용.
 * 테이블: chat(env CHAT_TABLE) 연결·메시지 + challenges(읽기전용) 참여자 검증.
 */
import { randomUUID } from 'node:crypto';
import { createDailyAnonymousId } from '@chum7/core';
import { verifyToken } from './auth';
import { getChatEligibility } from './challenges';
import { loadAnonSalt } from './anon-salt';
import {
  getConnectionMeta,
  listRecentMessages,
  listRoomConnections,
  removeConnection,
  saveConnection,
  saveMessage,
  type ChatMessage,
} from './repo/chat';
import { broadcast, callbackEndpoint, sendTo } from './broadcast';

const MAX_TEXT_LENGTH = 1000;

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
    // $connect 실패는 연결 거부(비200), 그 외는 200(소켓 유지)
    return routeKey === '$connect' ? { statusCode: 500, body: 'ERROR' } : okResult;
  }
};

async function onConnect(event: WsEvent): Promise<WsResult> {
  const { connectionId } = event.requestContext;
  const token = event.queryStringParameters?.token;
  const challengeId = event.queryStringParameters?.challengeId;
  if (!token || !challengeId) return { statusCode: 400, body: 'MISSING_PARAMS' };

  let userId: string;
  try {
    ({ userId } = await verifyToken(token));
  } catch {
    return { statusCode: 401, body: 'UNAUTHORIZED' };
  }

  const { eligible } = await getChatEligibility(challengeId, userId);
  if (!eligible) return { statusCode: 403, body: 'FORBIDDEN' };

  const displayName = createDailyAnonymousId(challengeId, userId, await loadAnonSalt());
  await saveConnection(challengeId, { connectionId, userId, displayName }, Date.now());
  return okResult;
}

async function onSendMessage(event: WsEvent): Promise<WsResult> {
  const { connectionId, domainName, stage } = event.requestContext;
  const meta = await getConnectionMeta(connectionId);
  if (!meta) return okResult; // 등록되지 않은 연결 — 무시

  const text = parseText(event.body);
  if (!text) return okResult;

  const now = Date.now();
  const message: ChatMessage = {
    messageId: randomUUID(),
    displayName: meta.displayName,
    text,
    createdAt: new Date(now).toISOString(),
  };
  await saveMessage(meta.challengeId, connectionId, message, now);

  const endpoint = callbackEndpoint(domainName, stage);
  const connections = await listRoomConnections(meta.challengeId);
  await broadcast(endpoint, meta.challengeId, connections, { type: 'message', message });
  return okResult;
}

/** $default — 클라이언트가 접속 직후 보내는 {action:'history'} 처리(그 외 액션은 무시). */
async function onDefault(event: WsEvent): Promise<WsResult> {
  const { connectionId, domainName, stage } = event.requestContext;
  const action = parseAction(event.body);
  if (action !== 'history') return okResult;

  const meta = await getConnectionMeta(connectionId);
  if (!meta) return okResult;

  const messages = await listRecentMessages(meta.challengeId);
  const endpoint = callbackEndpoint(domainName, stage);
  await sendTo(
    endpoint,
    connectionId,
    { type: 'ready', displayName: meta.displayName, messages },
    meta.challengeId,
  );
  return okResult;
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
