import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * commerce 테이블 — 완주 선물 교환권 (리더 → 완주자).
 *
 *  GIFTCAT#<challengeId> / ITEM#<giftId>  — 리더가 미리 등록한 선물 카탈로그 (일괄 발송용)
 *  VOUCHER#<voucherId> / META             — 발행된 교환권
 *    gsi1: VOUCHERUSER#<userId> / createdAt  (유저 교환권함)
 *    gsi2: VOUCHERCHAL#<challengeId> / createdAt (리더 발송 현황)
 *
 *  교환권 상태: issued(발행) → claimed(교환 신청 — digital은 사용 완료, physical은 배송 대기)
 *              → shipped(발송) → delivered(수령 확인). 만료는 lazy 판정(issued && expiresAt<now).
 *  만료: 발행 시 기본 +30일. 지급(claim) 전(status=issued)까지만 이름/설명/만료일 수정 가능.
 *  실물(physical) claim 시 수령인 이름/전화/주소를 recipient에 저장(PII — 리더·본인만 노출).
 */

const TABLE = 'COMMERCE_TABLE';

export const VOUCHER_DEFAULT_EXPIRY_DAYS = 30;

export interface GiftCatalogItem {
  giftId: string;
  challengeId: string;
  leaderId: string;
  name: string;
  description?: string | null;
  type: 'digital' | 'physical';
  createdAt: string;
}

export interface VoucherRecipient {
  name: string;
  phone: string;
  address: string;
}

export interface VoucherItem {
  voucherId: string;
  challengeId: string;
  challengeTitle?: string | null;
  leaderId: string;
  userId: string;
  giftName: string;
  giftDescription?: string | null;
  type: 'digital' | 'physical';
  status: 'issued' | 'claimed' | 'shipped' | 'delivered' | 'expired';
  createdAt: string;
  expiresAt: string;
  claimedAt?: string | null;
  recipient?: VoucherRecipient | null;
  shippedAt?: string | null;
  trackingInfo?: string | null;
  deliveredAt?: string | null;
}

const stripDbKeys = <T,>(item: Record<string, any>): T => {
  const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, ...rest } = item;
  return rest as T;
};

async function queryAll(params: {
  index?: 'gsi1' | 'gsi2';
  pkName: string;
  pkValue: string;
  skPrefix?: { name: string; value: string };
}): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        ...(params.index ? { IndexName: params.index } : {}),
        KeyConditionExpression: params.skPrefix
          ? `${params.pkName} = :pk AND begins_with(${params.skPrefix.name}, :sk)`
          : `${params.pkName} = :pk`,
        ExpressionAttributeValues: {
          ':pk': params.pkValue,
          ...(params.skPrefix ? { ':sk': params.skPrefix.value } : {}),
        },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ── 카탈로그 ──────────────────────────────────────────────────────────────

export async function putGiftCatalogItem(item: GiftCatalogItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: { pk: `GIFTCAT#${item.challengeId}`, sk: `ITEM#${item.giftId}`, ...item },
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
}

export async function listGiftCatalog(challengeId: string): Promise<GiftCatalogItem[]> {
  const items = await queryAll({
    pkName: 'pk',
    pkValue: `GIFTCAT#${challengeId}`,
    skPrefix: { name: 'sk', value: 'ITEM#' },
  });
  return items.map((i) => stripDbKeys<GiftCatalogItem>(i));
}

export async function getGiftCatalogItem(
  challengeId: string,
  giftId: string,
): Promise<GiftCatalogItem | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: `GIFTCAT#${challengeId}`, sk: `ITEM#${giftId}` } }),
  );
  return res.Item ? stripDbKeys<GiftCatalogItem>(res.Item) : undefined;
}

export async function deleteGiftCatalogItem(challengeId: string, giftId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tableName(TABLE), Key: { pk: `GIFTCAT#${challengeId}`, sk: `ITEM#${giftId}` } }),
  );
}

// ── 교환권 ────────────────────────────────────────────────────────────────

export async function putVoucher(voucher: VoucherItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `VOUCHER#${voucher.voucherId}`,
        sk: 'META',
        gsi1pk: `VOUCHERUSER#${voucher.userId}`,
        gsi1sk: voucher.createdAt,
        gsi2pk: `VOUCHERCHAL#${voucher.challengeId}`,
        gsi2sk: voucher.createdAt,
        ...voucher,
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }),
  );
}

export async function getVoucher(voucherId: string): Promise<VoucherItem | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: `VOUCHER#${voucherId}`, sk: 'META' } }),
  );
  return res.Item ? stripDbKeys<VoucherItem>(res.Item) : undefined;
}

export async function listMyVouchers(userId: string): Promise<VoucherItem[]> {
  const items = await queryAll({ index: 'gsi1', pkName: 'gsi1pk', pkValue: `VOUCHERUSER#${userId}` });
  return items.map((i) => stripDbKeys<VoucherItem>(i));
}

export async function listVouchersByChallenge(challengeId: string): Promise<VoucherItem[]> {
  const items = await queryAll({ index: 'gsi2', pkName: 'gsi2pk', pkValue: `VOUCHERCHAL#${challengeId}` });
  return items.map((i) => stripDbKeys<VoucherItem>(i));
}

/** 상태 전이 — 현재 상태 일치 조건부(중복/경합 방지). 성공 시 true. */
export async function transitionVoucher(
  voucherId: string,
  from: VoucherItem['status'],
  to: VoucherItem['status'],
  patch: Record<string, unknown>,
): Promise<boolean> {
  const names: Record<string, string> = { '#st': 'status' };
  const values: Record<string, unknown> = { ':to': to, ':from': from };
  const sets: string[] = ['#st = :to'];
  let i = 0;
  for (const [key, value] of Object.entries(patch)) {
    i += 1;
    names[`#p${i}`] = key;
    values[`:v${i}`] = value ?? null;
    sets.push(`#p${i} = :v${i}`);
  }
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: `VOUCHER#${voucherId}`, sk: 'META' },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: '#st = :from',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

/** 지급 전(issued) 내용 수정 — 이름/설명/만료일. issued 조건부라 지급 후엔 잠긴다. */
export async function updateVoucherBeforeClaim(
  voucherId: string,
  patch: { giftName?: string; giftDescription?: string | null; expiresAt?: string },
): Promise<boolean> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return true;
  const names: Record<string, string> = { '#st': 'status' };
  const values: Record<string, unknown> = { ':issued': 'issued' };
  const sets: string[] = [];
  entries.forEach(([key, value], i) => {
    names[`#p${i}`] = key;
    values[`:v${i}`] = value ?? null;
    sets.push(`#p${i} = :v${i}`);
  });
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: `VOUCHER#${voucherId}`, sk: 'META' },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: '#st = :issued',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}
