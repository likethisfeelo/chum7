import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { CouponStatus } from '../domain/coupon-rules';

/**
 * 쿠폰 키 설계:
 *  COUPON#<code> / META
 *  gsi1: COUPONUSER#<issuedToUserId> / createdAt (내 쿠폰함 — 지정 발급분)
 *  gsi3: COUPONALL / createdAt                   (어드민 전체 목록)
 */
export interface CouponItem {
  code: string;
  challengeId: string; // 'ANY' 허용
  issuedToUserId?: string | null;
  status: CouponStatus;
  expiresAt?: string | null;
  memo?: string | null;
  createdBy: string;
  createdAt: string;
  redeemedByUserId?: string | null;
  redeemedOrderId?: string | null;
  redeemedAt?: string | null;
}

export async function putCoupon(coupon: CouponItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName('COMMERCE_TABLE'),
      Item: {
        pk: `COUPON#${coupon.code}`,
        sk: 'META',
        ...(coupon.issuedToUserId
          ? { gsi1pk: `COUPONUSER#${coupon.issuedToUserId}`, gsi1sk: coupon.createdAt }
          : {}),
        gsi3pk: 'COUPONALL',
        gsi3sk: coupon.createdAt,
        ...coupon,
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );
}

export async function getCoupon(code: string): Promise<CouponItem | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName('COMMERCE_TABLE'), Key: { pk: `COUPON#${code}`, sk: 'META' } }),
  );
  return result.Item as CouponItem | undefined;
}

export async function listMyCoupons(userId: string): Promise<CouponItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName('COMMERCE_TABLE'),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': `COUPONUSER#${userId}` },
      ScanIndexForward: false,
    }),
  );
  return (result.Items ?? []) as CouponItem[];
}

export async function listAllCoupons(limit = 100): Promise<CouponItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName('COMMERCE_TABLE'),
      IndexName: 'gsi3',
      KeyConditionExpression: 'gsi3pk = :pk',
      ExpressionAttributeValues: { ':pk': 'COUPONALL' },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items ?? []) as CouponItem[];
}

/** 조건부 상태 전환 — redeem은 active일 때만 성공 (동시 사용 방지) */
export async function markCoupon(
  code: string,
  from: CouponStatus,
  to: CouponStatus,
  patch: Partial<CouponItem> = {},
): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName('COMMERCE_TABLE'),
        Key: { pk: `COUPON#${code}`, sk: 'META' },
        UpdateExpression:
          'SET #status = :to' + Object.keys(patch).map((_, i) => `, #p${i} = :v${i}`).join(''),
        ConditionExpression: '#status = :from',
        ExpressionAttributeNames: {
          '#status': 'status',
          ...Object.fromEntries(Object.keys(patch).map((k, i) => [`#p${i}`, k])),
        },
        ExpressionAttributeValues: {
          ':to': to,
          ':from': from,
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
