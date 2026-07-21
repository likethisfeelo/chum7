import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/** 프로세스당 1개의 DocumentClient — 핸들러에서 개별 생성 금지 (REDESIGN_PLAN §3.1) */
export const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** 도메인 테이블명 — 각 Lambda에는 자기 도메인 테이블 env만 주입된다 */
export function tableName(envKey: string): string {
  const value = process.env[envKey];
  if (!value) throw new Error(`Missing table env: ${envKey}`);
  return value;
}
