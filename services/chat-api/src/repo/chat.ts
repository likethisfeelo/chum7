/**
 * chat 테이블 — 챌린지 단체 채팅 + 1:1 리더 DM. WebSocket 연결 레지스트리 + 메시지 로그 + 읽음.
 * roomKey: 그룹=challengeId, DM=`dm#<challengeId>#<participantId>`.
 *  방 멤버십  pk=`ROOM#<roomKey>` sk=`CONN#<connectionId>`   (브로드캐스트 대상)
 *  연결 역참조 pk=`CONN#<connectionId>` sk=`META`             ($disconnect·send 시 방 조회)
 *  메시지     pk=`MSG#<roomKey>`  sk=`<createdAt>#<connectionId>` (최근 N개)
 *  읽음(DM)   pk=`READ#<roomKey>`  sk=`USER#<userId>`          (lastReadAt)
 * 연결 TTL 2h. 메시지 TTL: 그룹 24h(임시)·DM 90d(보존).
 */
import { DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const TABLE = 'CHAT_TABLE';

const CONNECTION_TTL_SECONDS = 2 * 60 * 60;
export const GROUP_MESSAGE_TTL_SECONDS = 24 * 60 * 60;
export const DM_MESSAGE_TTL_SECONDS = 90 * 24 * 60 * 60;
const RECENT_LIMIT = 50;

const roomPk = (roomKey: string) => `ROOM#${roomKey}`;
const connSk = (connectionId: string) => `CONN#${connectionId}`;
const connPk = (connectionId: string) => `CONN#${connectionId}`;
const msgPk = (roomKey: string) => `MSG#${roomKey}`;
const readPk = (roomKey: string) => `READ#${roomKey}`;

function epochSeconds(nowMs: number): number {
  return Math.floor(nowMs / 1000);
}

export interface Connection {
  connectionId: string;
  userId: string;
  displayName: string;
  isLeader: boolean;
  /** 라이브 방 전용 — 발언 역할 (speaker/listener) */
  role?: string;
  /** 라이브 방 전용 — 방 개설자 여부 */
  isHost?: boolean;
}

export interface ChatMessage {
  messageId: string;
  displayName: string;
  text: string;
  createdAt: string;
  isLeader: boolean;
}

/** $connect — 방 멤버십 + 연결 역참조 두 아이템 기록. */
export async function saveConnection(
  roomKey: string,
  conn: Connection,
  nowMs: number,
): Promise<void> {
  const ttl = epochSeconds(nowMs) + CONNECTION_TTL_SECONDS;
  const liveAttrs = {
    ...(conn.role !== undefined ? { role: conn.role } : {}),
    ...(conn.isHost !== undefined ? { isHost: conn.isHost } : {}),
  };
  await Promise.all([
    docClient.send(
      new PutCommand({
        TableName: tableName(TABLE),
        Item: {
          pk: roomPk(roomKey),
          sk: connSk(conn.connectionId),
          connectionId: conn.connectionId,
          userId: conn.userId,
          displayName: conn.displayName,
          isLeader: conn.isLeader,
          ...liveAttrs,
          ttl,
        },
      }),
    ),
    docClient.send(
      new PutCommand({
        TableName: tableName(TABLE),
        Item: {
          pk: connPk(conn.connectionId),
          sk: 'META',
          roomKey,
          userId: conn.userId,
          displayName: conn.displayName,
          isLeader: conn.isLeader,
          ...liveAttrs,
          ttl,
        },
      }),
    ),
  ]);
}

/** 라이브 방 — 발언 역할 변경 (ROOM# 아이템만, 로스터 재조회 기준) */
export async function updateConnectionRole(
  roomKey: string,
  connectionId: string,
  role: 'speaker' | 'listener',
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: roomPk(roomKey), sk: connSk(connectionId) },
      UpdateExpression: 'SET #r = :role',
      ConditionExpression: 'attribute_exists(sk)',
      ExpressionAttributeNames: { '#r': 'role' },
      ExpressionAttributeValues: { ':role': role },
    }),
  );
}

export interface ConnectionMeta {
  roomKey: string;
  userId: string;
  displayName: string;
  isLeader: boolean;
  role?: string;
  isHost?: boolean;
}

/** 연결 역참조 조회. */
export async function getConnectionMeta(
  connectionId: string,
): Promise<ConnectionMeta | undefined> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: { ':pk': connPk(connectionId), ':sk': 'META' },
    }),
  );
  const meta = res.Items?.[0];
  if (!meta) return undefined;
  return {
    roomKey: meta.roomKey,
    userId: meta.userId,
    displayName: meta.displayName,
    isLeader: Boolean(meta.isLeader),
    ...(typeof meta.role === 'string' ? { role: meta.role } : {}),
    ...(meta.isHost !== undefined ? { isHost: Boolean(meta.isHost) } : {}),
  };
}

/** $disconnect — 연결 역참조로 방을 찾아 두 아이템 제거. */
export async function removeConnection(connectionId: string): Promise<void> {
  const meta = await getConnectionMeta(connectionId);
  await deleteConnectionItems(connectionId, meta?.roomKey);
}

/** stale(410) 연결 정리 — roomKey 를 알고 있을 때 두 아이템 모두 제거. */
export async function deleteConnectionItems(
  connectionId: string,
  roomKey?: string,
): Promise<void> {
  const deletes: Promise<unknown>[] = [
    docClient.send(
      new DeleteCommand({
        TableName: tableName(TABLE),
        Key: { pk: connPk(connectionId), sk: 'META' },
      }),
    ),
  ];
  if (roomKey) {
    deletes.push(
      docClient.send(
        new DeleteCommand({
          TableName: tableName(TABLE),
          Key: { pk: roomPk(roomKey), sk: connSk(connectionId) },
        }),
      ),
    );
  }
  await Promise.all(deletes);
}

/** 방 참여 연결 전체 — 브로드캐스트 대상. */
export async function listRoomConnections(roomKey: string): Promise<Connection[]> {
  const conns: Connection[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :c)',
        ExpressionAttributeValues: { ':pk': roomPk(roomKey), ':c': 'CONN#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of res.Items ?? []) {
      conns.push({
        connectionId: item.connectionId,
        userId: item.userId,
        displayName: item.displayName,
        isLeader: Boolean(item.isLeader),
        ...(typeof item.role === 'string' ? { role: item.role } : {}),
        ...(item.isHost !== undefined ? { isHost: Boolean(item.isHost) } : {}),
      });
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return conns;
}

/** 메시지 저장 (ttlSeconds: 그룹 24h · DM 90d). */
export async function saveMessage(
  roomKey: string,
  connectionId: string,
  message: ChatMessage,
  nowMs: number,
  ttlSeconds: number,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: msgPk(roomKey),
        sk: `${message.createdAt}#${connectionId}`,
        messageId: message.messageId,
        displayName: message.displayName,
        text: message.text,
        createdAt: message.createdAt,
        isLeader: message.isLeader,
        ttl: epochSeconds(nowMs) + ttlSeconds,
      },
    }),
  );
}

/** 최근 메시지(오래된→최신). */
export async function listRecentMessages(roomKey: string): Promise<ChatMessage[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': msgPk(roomKey) },
      ScanIndexForward: false,
      Limit: RECENT_LIMIT,
    }),
  );
  const items = res.Items ?? [];
  return items
    .map((item) => ({
      messageId: item.messageId,
      displayName: item.displayName,
      text: item.text,
      createdAt: item.createdAt,
      isLeader: Boolean(item.isLeader),
    }))
    .reverse();
}

/** DM 읽음 표시 — 사용자의 lastReadAt 갱신. */
export async function setLastRead(roomKey: string, userId: string, at: string): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: readPk(roomKey),
        sk: `USER#${userId}`,
        userId,
        lastReadAt: at,
        ttl: epochSeconds(Date.parse(at) || Date.now()) + DM_MESSAGE_TTL_SECONDS,
      },
    }),
  );
}

/** 상대(나 이외 사용자)의 lastReadAt 중 최신값 — 보낸 메시지 '읽음' 판정용. */
export async function getPeerLastReadAt(roomKey: string, myUserId: string): Promise<string | null> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :u)',
      ExpressionAttributeValues: { ':pk': readPk(roomKey), ':u': 'USER#' },
    }),
  );
  let peer: string | null = null;
  for (const item of res.Items ?? []) {
    if (item.userId === myUserId) continue;
    if (typeof item.lastReadAt === 'string' && (!peer || item.lastReadAt > peer)) {
      peer = item.lastReadAt;
    }
  }
  return peer;
}
