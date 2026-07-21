/**
 * challenges 테이블 — 관심 챌린지 (신규 설계 — 레거시 핸들러 없음).
 *  pk=`CHAL#<challengeId>`, sk=`INTEREST#<userId>` (GSI 불필요 — 조회는 자연 키 Get)
 *  카운트는 챌린지 META 의 stats.interestCount 로 유지 (adjustChallengeStats 패턴).
 */
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE, challengePk } from './shared';

const interestSk = (userId: string) => `INTEREST#${userId}`;

export async function getInterest(
  challengeId: string,
  userId: string,
): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: challengePk(challengeId), sk: interestSk(userId) },
    }),
  );
  return res.Item;
}

/** 등록 — 중복 등록 방지 조건부 Put. 이미 있으면 false (동시 토글 흡수) */
export async function putInterest(challengeId: string, userId: string, now: string): Promise<boolean> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(TABLE),
        Item: {
          pk: challengePk(challengeId),
          sk: interestSk(userId),
          challengeId,
          userId,
          createdAt: now,
        },
        ConditionExpression: 'attribute_not_exists(sk)',
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

/** 해제 — 존재 조건부 Delete. 이미 없으면 false (동시 토글 흡수) */
export async function deleteInterest(challengeId: string, userId: string): Promise<boolean> {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: tableName(TABLE),
        Key: { pk: challengePk(challengeId), sk: interestSk(userId) },
        ConditionExpression: 'attribute_exists(sk)',
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

/**
 * stats.interestCount 증감 — adjustChallengeStats(repo/challenges.ts) 패턴 승계.
 * 감소는 0 미만 방지 조건. 조건 실패는 무해(카운트 이미 0) — 로깅만.
 */
export async function adjustInterestCount(
  challengeId: string,
  delta: 1 | -1,
  now: string,
): Promise<void> {
  const values: Record<string, unknown> = { ':zero': 0, ':d': delta, ':now': now };
  const decrement = delta < 0;
  if (decrement) values[':abs'] = Math.abs(delta);

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: challengePk(challengeId), sk: 'META' },
        UpdateExpression:
          'SET stats.interestCount = if_not_exists(stats.interestCount, :zero) + :d, updatedAt = :now',
        ExpressionAttributeValues: values,
        ...(decrement
          ? { ConditionExpression: 'if_not_exists(stats.interestCount, :zero) >= :abs' }
          : {}),
      }),
    );
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return;
    throw error;
  }
}
