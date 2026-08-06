import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * commerce 테이블 정산/반환 키 설계 (settlement-worker가 생성, 어드민이 완료 처리):
 *  REFUND#<orderId> / META        — 보증금 반환 대기 (완주자)
 *    gsi2: REFUNDSTATUS#<status> / createdAt    (어드민 큐)
 *  SETTLEMENT#<challengeId> / META — 챌린지 정산서
 *    gsi2: SETTLEMENTSTATUS#<status> / createdAt (어드민 큐)
 * v0는 수동 지급: refund_due→completed / held→ready→paid (PAYMENT_SPEC §6).
 * 정산서는 held(환불 보류)로 생성되고, 보류 경과 후 어드민 release로 ready 전환된다.
 */

export type RefundStatus = 'refund_due' | 'completed';
export type SettlementStatus = 'held' | 'ready' | 'paid';

export interface RefundItem {
  orderId: string;
  userId: string;
  challengeId: string;
  challengeTitle?: string | null;
  amount: number;
  status: RefundStatus;
  createdAt: string;
  completedAt?: string | null;
  completedBy?: string | null;
  memo?: string | null;
}

export interface SettlementItem {
  challengeId: string;
  creatorId: string;
  challengeTitle?: string | null;
  pricingType: 'paid_fee' | 'paid_deposit';
  orderCount: number;
  refundDueCount: number;
  grossAmount: number;
  platformFee: number;
  payoutAmount: number;
  status: SettlementStatus;
  createdAt: string;
  /** 환불 보류 해제 예정 시각 (종료+7일) — held 동안 지급 불가 */
  holdUntil?: string | null;
  /** 보류 해제 시 settlement.ready 알림 발행 여부 */
  notifyOnRelease?: boolean;
  releasedAt?: string | null;
  releasedBy?: string | null;
  paidAt?: string | null;
  paidBy?: string | null;
  memo?: string | null;
}

async function listByGsi2(gsi2pk: string, limit: number): Promise<Record<string, unknown>[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName('COMMERCE_TABLE'),
      IndexName: 'gsi2',
      KeyConditionExpression: 'gsi2pk = :pk',
      ExpressionAttributeValues: { ':pk': gsi2pk },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items ?? []) as Record<string, unknown>[];
}

export async function listRefundsByStatus(status: RefundStatus, limit = 100): Promise<RefundItem[]> {
  return (await listByGsi2(`REFUNDSTATUS#${status}`, limit)) as unknown as RefundItem[];
}

export async function listSettlementsByStatus(status: SettlementStatus, limit = 100): Promise<SettlementItem[]> {
  return (await listByGsi2(`SETTLEMENTSTATUS#${status}`, limit)) as unknown as SettlementItem[];
}

export async function getRefund(orderId: string): Promise<RefundItem | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName('COMMERCE_TABLE'), Key: { pk: `REFUND#${orderId}`, sk: 'META' } }),
  );
  return result.Item as RefundItem | undefined;
}

export async function getSettlement(challengeId: string): Promise<SettlementItem | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName('COMMERCE_TABLE'), Key: { pk: `SETTLEMENT#${challengeId}`, sk: 'META' } }),
  );
  return result.Item as SettlementItem | undefined;
}

/** 상태 전이 — 조건부(현재 상태 일치)로만, gsi2 키 동기화 (repo/orders.ts transitionOrder 패턴) */
async function transitionStatusItem(
  pk: string,
  gsi2Prefix: string,
  from: string,
  to: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName('COMMERCE_TABLE'),
        Key: { pk, sk: 'META' },
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
          ':gsi2pk': `${gsi2Prefix}${to}`,
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

export async function transitionRefund(
  orderId: string,
  from: RefundStatus,
  to: RefundStatus,
  patch: Partial<RefundItem>,
): Promise<boolean> {
  return transitionStatusItem(`REFUND#${orderId}`, 'REFUNDSTATUS#', from, to, patch);
}

export async function transitionSettlement(
  challengeId: string,
  from: SettlementStatus,
  to: SettlementStatus,
  patch: Partial<SettlementItem>,
): Promise<boolean> {
  return transitionStatusItem(`SETTLEMENT#${challengeId}`, 'SETTLEMENTSTATUS#', from, to, patch);
}
