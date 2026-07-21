/**
 * users 테이블 — 어드민 단일 사용자 조회 (키 설계: 이전 가이드 §3 users).
 *  프로필: pk=`USER#<userId>`/sk=`PROFILE`, gsi1pk=`EMAIL#<email>`/gsi1sk=`USER`
 * 전체 목록 조회 경로는 설계상 없음 (풀스캔 금지) — PORTING.md 참고.
 */
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const TABLE = 'USERS_TABLE';

/** 이메일로 프로필 조회 — gsi1pk=EMAIL#<email> */
export async function findProfilesByEmail(email: string): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': `EMAIL#${email}` },
    }),
  );
  return res.Items ?? [];
}

/** userId로 프로필 조회 */
export async function getProfile(userId: string): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: `USER#${userId}`, sk: 'PROFILE' } }),
  );
  return res.Item;
}
