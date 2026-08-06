/**
 * users 테이블 read-only — @handle → userId 해석.
 * 문서화된 크로스 도메인 예외: 공개 프로필 표면(/public/users/:handle/achievements)이
 * 핸들만으로 동작해야 원본 userId를 URL에 노출하지 않을 수 있다 (프로필 주소 래핑 정책).
 * 핸들 조회: users gsi1pk=`HANDLE#<handle>` (user-api repo/profile-repo.ts와 동일 키). 쓰기 금지.
 */
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const USERS_TABLE = 'USERS_TABLE';

/** @handle(또는 handle) → userId. 없으면 null. */
export async function resolveHandleToUserId(handleRaw: string): Promise<string | null> {
  const handle = handleRaw.replace(/^@/, '').toLowerCase().trim();
  if (!handle) return null;
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(USERS_TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :h',
      ExpressionAttributeValues: { ':h': `HANDLE#${handle}` },
      Limit: 1,
    }),
  );
  const item = res.Items?.[0];
  return item ? String(item.userId) : null;
}

/** 경로 파라미터 해석 — `@handle`이면 핸들 조회, 아니면 userId 그대로 */
export async function resolveUserParam(param: string): Promise<string | null> {
  if (param.startsWith('@')) return resolveHandleToUserId(param);
  return param || null;
}
