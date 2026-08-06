import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * commerce 테이블 — 유료 조인 티켓 (결제 동일 효력, 소진 시 amount=0 'ticket' 주문 생성).
 * 발급 체인: 운영자 → 리더(배부, 할당량) → 유저(부여/신청 승인) → 소진(참여).
 *
 *  TICKETBATCH#<batchId> / META    — 운영자→리더 배부 (할당량 total, 발급 issued)
 *    gsi1: TICKETLEADER#<leaderId> / createdAt      (리더의 배부 목록)
 *    gsi2: TICKETBATCHCHAL#<challengeId> / createdAt (챌린지별·어드민 조회)
 *  TICKET#<ticketId> / META        — 유저에게 발급된 티켓
 *    gsi1: TICKETUSER#<userId> / createdAt          (내 티켓함)
 *    gsi2: TICKETCHAL#<challengeId> / createdAt     (리더 발급 현황)
 *    status: offered(발급) → consumed(소진) | revoked(회수)
 *  TICKETREQ#<challengeId>#<userId> / META — 유저→리더 티켓 신청 (유저 확인용 신청 시스템)
 *    gsi2: TICKETREQCHAL#<challengeId> / createdAt  (리더 심사 큐)
 *    status: pending → approved | rejected  (키가 (챌린지,유저)당 고정 — 재신청은 덮어쓰기)
 */

const TABLE = 'COMMERCE_TABLE';

export interface TicketBatchItem {
  batchId: string;
  challengeId: string;
  challengeTitle?: string | null;
  leaderId: string;
  total: number;
  issued: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketItem {
  ticketId: string;
  batchId: string;
  challengeId: string;
  challengeTitle?: string | null;
  leaderId: string;
  userId: string;
  status: 'offered' | 'consumed' | 'revoked';
  grantedBy: string;
  createdAt: string;
  consumedAt?: string | null;
  consumedOrderId?: string | null;
}

export interface TicketRequestItem {
  challengeId: string;
  userId: string;
  message?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  rejectReason?: string | null;
}

const stripDbKeys = <T,>(item: Record<string, any>): T => {
  const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, ...rest } = item;
  return rest as T;
};

async function queryAll(params: {
  index?: 'gsi1' | 'gsi2';
  pkName: string;
  pkValue: string;
}): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        ...(params.index ? { IndexName: params.index } : {}),
        KeyConditionExpression: `${params.pkName} = :pk`,
        ExpressionAttributeValues: { ':pk': params.pkValue },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ── 배부(batch) ────────────────────────────────────────────────────────────

export async function putTicketBatch(batch: TicketBatchItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `TICKETBATCH#${batch.batchId}`,
        sk: 'META',
        gsi1pk: `TICKETLEADER#${batch.leaderId}`,
        gsi1sk: batch.createdAt,
        gsi2pk: `TICKETBATCHCHAL#${batch.challengeId}`,
        gsi2sk: batch.createdAt,
        ...batch,
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );
}

export async function listBatchesByChallenge(challengeId: string): Promise<TicketBatchItem[]> {
  const items = await queryAll({ index: 'gsi2', pkName: 'gsi2pk', pkValue: `TICKETBATCHCHAL#${challengeId}` });
  return items.map((i) => stripDbKeys<TicketBatchItem>(i));
}

export async function listBatchesByLeader(leaderId: string): Promise<TicketBatchItem[]> {
  const items = await queryAll({ index: 'gsi1', pkName: 'gsi1pk', pkValue: `TICKETLEADER#${leaderId}` });
  return items.map((i) => stripDbKeys<TicketBatchItem>(i));
}

/** 발급 슬롯 1개 소비 — issued < total 조건부 증가. 성공 시 true. */
export async function consumeBatchSlot(batchId: string, nowIso: string): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: `TICKETBATCH#${batchId}`, sk: 'META' },
        UpdateExpression: 'SET issued = issued + :one, updatedAt = :now',
        ConditionExpression: 'issued < #total',
        ExpressionAttributeNames: { '#total': 'total' },
        ExpressionAttributeValues: { ':one': 1, ':now': nowIso },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

// ── 티켓 ──────────────────────────────────────────────────────────────────

export async function putTicket(ticket: TicketItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `TICKET#${ticket.ticketId}`,
        sk: 'META',
        gsi1pk: `TICKETUSER#${ticket.userId}`,
        gsi1sk: ticket.createdAt,
        gsi2pk: `TICKETCHAL#${ticket.challengeId}`,
        gsi2sk: ticket.createdAt,
        ...ticket,
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );
}

export async function getTicket(ticketId: string): Promise<TicketItem | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: `TICKET#${ticketId}`, sk: 'META' } }),
  );
  return res.Item ? stripDbKeys<TicketItem>(res.Item) : undefined;
}

export async function listMyTickets(userId: string): Promise<TicketItem[]> {
  const items = await queryAll({ index: 'gsi1', pkName: 'gsi1pk', pkValue: `TICKETUSER#${userId}` });
  return items.map((i) => stripDbKeys<TicketItem>(i));
}

export async function listTicketsByChallenge(challengeId: string): Promise<TicketItem[]> {
  const items = await queryAll({ index: 'gsi2', pkName: 'gsi2pk', pkValue: `TICKETCHAL#${challengeId}` });
  return items.map((i) => stripDbKeys<TicketItem>(i));
}

/** 소진 — offered→consumed 조건부 전이(이중 사용 방지). 성공 시 true. */
export async function consumeTicket(ticketId: string, orderId: string, nowIso: string): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: `TICKET#${ticketId}`, sk: 'META' },
        UpdateExpression: 'SET #st = :consumed, consumedAt = :now, consumedOrderId = :oid',
        ConditionExpression: '#st = :offered',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':consumed': 'consumed', ':offered': 'offered', ':now': nowIso, ':oid': orderId },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

// ── 티켓 신청 ─────────────────────────────────────────────────────────────

const requestPk = (challengeId: string, userId: string) => `TICKETREQ#${challengeId}#${userId}`;

export async function getTicketRequest(
  challengeId: string,
  userId: string,
): Promise<TicketRequestItem | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: requestPk(challengeId, userId), sk: 'META' } }),
  );
  return res.Item ? stripDbKeys<TicketRequestItem>(res.Item) : undefined;
}

/** 신청 저장 — 재신청(반려 후 등)은 덮어쓰기 허용. pending 중복 검사는 호출자 책임. */
export async function putTicketRequest(req: TicketRequestItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: requestPk(req.challengeId, req.userId),
        sk: 'META',
        gsi2pk: `TICKETREQCHAL#${req.challengeId}`,
        gsi2sk: req.createdAt,
        ...req,
      },
    }),
  );
}

export async function listTicketRequestsByChallenge(challengeId: string): Promise<TicketRequestItem[]> {
  const items = await queryAll({ index: 'gsi2', pkName: 'gsi2pk', pkValue: `TICKETREQCHAL#${challengeId}` });
  return items.map((i) => stripDbKeys<TicketRequestItem>(i));
}

/** 신청 처리 — pending 조건부 갱신(중복 처리 방지). 성공 시 true. */
export async function resolveTicketRequest(input: {
  challengeId: string;
  userId: string;
  status: 'approved' | 'rejected';
  resolvedBy: string;
  rejectReason?: string | null;
  nowIso: string;
}): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: requestPk(input.challengeId, input.userId), sk: 'META' },
        UpdateExpression:
          'SET #st = :status, resolvedAt = :now, resolvedBy = :by, rejectReason = :reason',
        ConditionExpression: '#st = :pending',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':status': input.status,
          ':pending': 'pending',
          ':now': input.nowIso,
          ':by': input.resolvedBy,
          ':reason': input.rejectReason ?? null,
        },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}
