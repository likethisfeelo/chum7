/**
 * social 테이블 — 관심영역(리더+카테고리) 구독.
 *  구독   pk=`INTSUB#LEADER#<leaderId>#CAT#<category>` sk=`USER#<userId>`
 *         gsi1pk=`INTSUBUSER#<userId>` gsi1sk=`<createdAt>` (내 구독 목록 — 최신순)
 *  팬아웃 = pk 파티션 begins_with(sk,'USER#') Query (구독자 전체) — notification-worker 가 동일 키로 조회.
 * 마당 좋아요 시 자동 upsert(카운트 증가). 사용자는 끄기(enabled=false)·삭제만 가능.
 */
import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE } from './shared';

export const intsubPk = (leaderId: string, category: string) => `INTSUB#LEADER#${leaderId}#CAT#${category}`;
export const intsubSk = (userId: string) => `USER#${userId}`;
export const intsubUserGsi1pk = (userId: string) => `INTSUBUSER#${userId}`;

export interface UpsertSubscriptionInput {
  leaderId: string;
  category: string;
  userId: string;
  name: string;
  now: string;
  sampleChallengeId?: string;
  sampleChallengeTitle?: string;
}

/**
 * 좋아요 시 자동 구독 upsert — 없으면 생성(enabled=true, count=1), 있으면 count 증가.
 * name/샘플은 최초 생성 시에만 세팅(if_not_exists), 이후 좋아요는 카운트만 누적.
 * enabled 는 갱신하지 않음(사용자가 끈 구독을 좋아요로 되살리지 않음).
 */
export async function upsertSubscriptionOnLike(input: UpsertSubscriptionInput): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: intsubPk(input.leaderId, input.category), sk: intsubSk(input.userId) },
      UpdateExpression: [
        'SET gsi1pk = if_not_exists(gsi1pk, :g1pk)',
        'gsi1sk = if_not_exists(gsi1sk, :now)',
        'userId = if_not_exists(userId, :userId)',
        'leaderId = if_not_exists(leaderId, :leaderId)',
        'category = if_not_exists(category, :category)',
        '#nm = if_not_exists(#nm, :name)',
        'enabled = if_not_exists(enabled, :true)',
        'sampleChallengeId = if_not_exists(sampleChallengeId, :scid)',
        'sampleChallengeTitle = if_not_exists(sampleChallengeTitle, :sctitle)',
        'createdAt = if_not_exists(createdAt, :now)',
        'updatedAt = :now',
        '#cnt = if_not_exists(#cnt, :zero) + :one',
      ].join(', '),
      ExpressionAttributeNames: { '#nm': 'name', '#cnt': 'count' },
      ExpressionAttributeValues: {
        ':g1pk': intsubUserGsi1pk(input.userId),
        ':now': input.now,
        ':userId': input.userId,
        ':leaderId': input.leaderId,
        ':category': input.category,
        ':name': input.name,
        ':true': true,
        ':scid': input.sampleChallengeId ?? null,
        ':sctitle': input.sampleChallengeTitle ?? null,
        ':zero': 0,
        ':one': 1,
      },
    }),
  );
}

/** 내 구독 목록 — gsi1 `INTSUBUSER#<userId>` Query (최신순) */
export async function listMySubscriptions(userId: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': intsubUserGsi1pk(userId) },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export async function getSubscription(
  leaderId: string,
  category: string,
  userId: string,
): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: intsubPk(leaderId, category), sk: intsubSk(userId) },
    }),
  );
  return res.Item ?? null;
}

/** on/off — 존재하는 구독만 갱신 */
export async function setSubscriptionEnabled(
  userId: string,
  leaderId: string,
  category: string,
  enabled: boolean,
  now: string,
): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: intsubPk(leaderId, category), sk: intsubSk(userId) },
        UpdateExpression: 'SET enabled = :en, updatedAt = :now',
        ConditionExpression: 'attribute_exists(sk)',
        ExpressionAttributeValues: { ':en': enabled, ':now': now },
      }),
    );
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

export async function deleteSubscription(
  userId: string,
  leaderId: string,
  category: string,
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: intsubPk(leaderId, category), sk: intsubSk(userId) },
    }),
  );
}
