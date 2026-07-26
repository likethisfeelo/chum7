/**
 * chat 테이블 — 챌린지 단체 채팅. WebSocket 연결 레지스트리 + 임시 메시지 로그.
 * 키 설계 (GSI 없이 메인 테이블 Query 만으로 브로드캐스트·최근조회 성립):
 *  방 멤버십  pk=`ROOM#<challengeId>` sk=`CONN#<connectionId>`   (브로드캐스트 대상 목록)
 *  연결 역참조 pk=`CONN#<connectionId>` sk=`META`                ($disconnect 시 방 조회)
 *  메시지     pk=`MSG#<challengeId>`  sk=`<createdAt>#<connectionId>` (최근 N개 조회)
 * 모든 아이템에 TTL 속성 `ttl`(epoch seconds) — 연결 2h, 메시지 24h 후 자동 삭제(임시성).
 */
import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const TABLE = 'CHAT_TABLE';

const CONNECTION_TTL_SECONDS = 2 * 60 * 60; // 2h — API GW WebSocket 최대 연결 수명
const MESSAGE_TTL_SECONDS = 24 * 60 * 60; // 24h — 임시 보존(새로고침 시 최근 대화 복원)
const RECENT_LIMIT = 50;

const roomPk = (challengeId: string) => `ROOM#${challengeId}`;
const connSk = (connectionId: string) => `CONN#${connectionId}`;
const connPk = (connectionId: string) => `CONN#${connectionId}`;
const msgPk = (challengeId: string) => `MSG#${challengeId}`;

function epochSeconds(nowMs: number): number {
  return Math.floor(nowMs / 1000);
}

export interface Connection {
  connectionId: string;
  userId: string;
  displayName: string;
  isLeader: boolean;
}

export interface ChatMessage {
  messageId: string;
  displayName: string;
  text: string;
  createdAt: string;
  isLeader: boolean;
}

/** $connect — 방 멤버십 + 연결 역참조 두 아이템을 함께 기록. */
export async function saveConnection(
  challengeId: string,
  conn: Connection,
  nowMs: number,
): Promise<void> {
  const ttl = epochSeconds(nowMs) + CONNECTION_TTL_SECONDS;
  await Promise.all([
    docClient.send(
      new PutCommand({
        TableName: tableName(TABLE),
        Item: {
          pk: roomPk(challengeId),
          sk: connSk(conn.connectionId),
          connectionId: conn.connectionId,
          userId: conn.userId,
          displayName: conn.displayName,
          isLeader: conn.isLeader,
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
          challengeId,
          userId: conn.userId,
          displayName: conn.displayName,
          isLeader: conn.isLeader,
          ttl,
        },
      }),
    ),
  ]);
}

export interface ConnectionMeta {
  challengeId: string;
  userId: string;
  displayName: string;
  isLeader: boolean;
}

/** 연결 역참조 조회 — sendMessage/history 에서 방·활동명 확인용. */
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
    challengeId: meta.challengeId,
    userId: meta.userId,
    displayName: meta.displayName,
    isLeader: Boolean(meta.isLeader),
  };
}

/** $disconnect — 연결 역참조로 방을 찾아 두 아이템 모두 제거. */
export async function removeConnection(connectionId: string): Promise<void> {
  const meta = await getConnectionMeta(connectionId);
  await deleteConnectionItems(connectionId, meta?.challengeId);
}

/** 브로드캐스트 중 stale(410) 연결 정리 — challengeId 를 이미 알고 있을 때. */
export async function deleteConnectionItems(
  connectionId: string,
  challengeId?: string,
): Promise<void> {
  const deletes: Promise<unknown>[] = [
    docClient.send(
      new DeleteCommand({
        TableName: tableName(TABLE),
        Key: { pk: connPk(connectionId), sk: 'META' },
      }),
    ),
  ];
  if (challengeId) {
    deletes.push(
      docClient.send(
        new DeleteCommand({
          TableName: tableName(TABLE),
          Key: { pk: roomPk(challengeId), sk: connSk(connectionId) },
        }),
      ),
    );
  }
  await Promise.all(deletes);
}

/** 방 참여 연결 전체 — 브로드캐스트 대상. */
export async function listRoomConnections(challengeId: string): Promise<Connection[]> {
  const conns: Connection[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :c)',
        ExpressionAttributeValues: { ':pk': roomPk(challengeId), ':c': 'CONN#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of res.Items ?? []) {
      conns.push({
        connectionId: item.connectionId,
        userId: item.userId,
        displayName: item.displayName,
        isLeader: Boolean(item.isLeader),
      });
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return conns;
}

/** 메시지 저장(TTL 24h). */
export async function saveMessage(
  challengeId: string,
  connectionId: string,
  message: ChatMessage,
  nowMs: number,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: msgPk(challengeId),
        sk: `${message.createdAt}#${connectionId}`,
        messageId: message.messageId,
        displayName: message.displayName,
        text: message.text,
        createdAt: message.createdAt,
        isLeader: message.isLeader,
        ttl: epochSeconds(nowMs) + MESSAGE_TTL_SECONDS,
      },
    }),
  );
}

/** 최근 메시지(오래된→최신 순으로 반환). */
export async function listRecentMessages(challengeId: string): Promise<ChatMessage[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': msgPk(challengeId) },
      ScanIndexForward: false, // 최신순으로 Limit
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
    .reverse(); // 화면 표시용 오래된→최신
}
