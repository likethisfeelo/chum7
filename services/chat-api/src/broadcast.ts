import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { deleteConnectionItems, type Connection } from './repo/chat';

/**
 * 관리 API 클라이언트 — 콜백 엔드포인트(도메인+스테이지)별 캐시.
 * 엔드포인트는 이벤트의 requestContext(domainName, stage)에서 파생하므로 env 불필요.
 */
const clients = new Map<string, ApiGatewayManagementApiClient>();

function client(endpoint: string): ApiGatewayManagementApiClient {
  let c = clients.get(endpoint);
  if (!c) {
    c = new ApiGatewayManagementApiClient({ endpoint });
    clients.set(endpoint, c);
  }
  return c;
}

export function callbackEndpoint(domainName: string, stage: string): string {
  return `https://${domainName}/${stage}`;
}

/** 단일 연결로 페이로드 전송. 410(Gone)이면 stale 연결 정리. */
export async function sendTo(
  endpoint: string,
  connectionId: string,
  payload: unknown,
  roomKey?: string,
): Promise<void> {
  try {
    await client(endpoint).send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(payload)),
      }),
    );
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number }; name?: string });
    if (status?.$metadata?.httpStatusCode === 410 || status?.name === 'GoneException') {
      await deleteConnectionItems(connectionId, roomKey).catch(() => undefined);
      return;
    }
    throw err;
  }
}

/** 방 전체 브로드캐스트 — 각 연결 병렬 전송, 실패는 개별 흡수(한 연결 오류가 전체를 막지 않음). */
export async function broadcast(
  endpoint: string,
  roomKey: string,
  connections: Connection[],
  payload: unknown,
): Promise<void> {
  await Promise.all(
    connections.map((conn) =>
      sendTo(endpoint, conn.connectionId, payload, roomKey).catch(() => undefined),
    ),
  );
}
