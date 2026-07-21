import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { OrderMethod, OrderStatus } from '../domain/order-state';

/**
 * commerce 테이블 주문 키 설계 (porting-guide §3):
 *  ORDER#<orderId> / META           — 주문 본문
 *  ORDER#<orderId> / LEDGER#<ts>#n  — append-only 원장 (수정·삭제 API 없음)
 *  gsi1: ORDERUSER#<userId> / createdAt   (내 주문)
 *  gsi2: ORDERSTATUS#<status> / createdAt (어드민 대기열)
 */
export interface OrderItem {
  orderId: string;
  userId: string;
  challengeId: string;
  challengeTitle: string | null;
  amount: number;
  pricingType: 'paid_fee' | 'paid_deposit';
  method: OrderMethod;
  status: OrderStatus;
  couponCode?: string | null;
  depositorName?: string | null;
  memo?: string | null;
  createdAt: string;
  paidAt?: string | null;
  resolvedBy?: string | null;
}

function metaKeys(
  order: Pick<OrderItem, 'orderId' | 'userId' | 'status' | 'createdAt' | 'challengeId'>,
) {
  return {
    pk: `ORDER#${order.orderId}`,
    sk: 'META',
    gsi1pk: `ORDERUSER#${order.userId}`,
    gsi1sk: order.createdAt,
    gsi2pk: `ORDERSTATUS#${order.status}`,
    gsi2sk: order.createdAt,
    // 챌린지별 주문 조회 — settlement-worker의 종료 정산에 사용
    gsi3pk: `ORDERCHAL#${order.challengeId}`,
    gsi3sk: order.createdAt,
  };
}

/** 챌린지의 전체 주문 조회 (정산·반환 대상 산출) */
export async function listOrdersByChallenge(challengeId: string): Promise<OrderItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName('COMMERCE_TABLE'),
      IndexName: 'gsi3',
      KeyConditionExpression: 'gsi3pk = :pk',
      ExpressionAttributeValues: { ':pk': `ORDERCHAL#${challengeId}` },
    }),
  );
  return (result.Items ?? []) as OrderItem[];
}

export async function putOrder(order: OrderItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName('COMMERCE_TABLE'),
      Item: { ...metaKeys(order), ...order },
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );
}

export async function getOrder(orderId: string): Promise<OrderItem | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName('COMMERCE_TABLE'), Key: { pk: `ORDER#${orderId}`, sk: 'META' } }),
  );
  return result.Item as OrderItem | undefined;
}

export async function listMyOrders(userId: string): Promise<OrderItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName('COMMERCE_TABLE'),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': `ORDERUSER#${userId}` },
      ScanIndexForward: false,
    }),
  );
  return (result.Items ?? []) as OrderItem[];
}

export async function listOrdersByStatus(status: OrderStatus, limit = 50): Promise<OrderItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName('COMMERCE_TABLE'),
      IndexName: 'gsi2',
      KeyConditionExpression: 'gsi2pk = :pk',
      ExpressionAttributeValues: { ':pk': `ORDERSTATUS#${status}` },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items ?? []) as OrderItem[];
}

/** 상태 전이 — 조건부(현재 상태 일치)로만. gsi2 키 동기화 포함 */
export async function transitionOrder(
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  patch: Partial<OrderItem>,
): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName('COMMERCE_TABLE'),
        Key: { pk: `ORDER#${orderId}`, sk: 'META' },
        UpdateExpression:
          'SET #status = :to, gsi2pk = :gsi2pk' +
          Object.keys(patch).map((k, i) => `, #p${i} = :v${i}`).join(''),
        ConditionExpression: '#status = :from',
        ExpressionAttributeNames: {
          '#status': 'status',
          ...Object.fromEntries(Object.keys(patch).map((k, i) => [`#p${i}`, k])),
        },
        ExpressionAttributeValues: {
          ':to': to,
          ':from': from,
          ':gsi2pk': `ORDERSTATUS#${to}`,
          ...Object.fromEntries(Object.values(patch).map((v, i) => [`:v${i}`, v ?? null])),
        },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

/** 원장 append — 모든 금전 이벤트 기록 (수정·삭제 없음) */
export async function appendLedger(
  orderId: string,
  event: string,
  actorUserId: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  const at = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: tableName('COMMERCE_TABLE'),
      Item: {
        pk: `ORDER#${orderId}`,
        sk: `LEDGER#${at}#${Math.random().toString(36).slice(2, 6)}`,
        event,
        actorUserId,
        detail: detail ?? null,
        at,
      },
    }),
  );
}

export async function listLedger(orderId: string): Promise<Record<string, unknown>[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName('COMMERCE_TABLE'),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `ORDER#${orderId}`, ':sk': 'LEDGER#' },
    }),
  );
  return (result.Items ?? []) as Record<string, unknown>[];
}
