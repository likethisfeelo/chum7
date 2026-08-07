/**
 * users 테이블 read-only — @handle → userId 해석 + 공개 프로필(publicProfile) 조회.
 * 문서화된 크로스 도메인 예외: 공개 프로필 표면(/public/users/:handle/*)이 핸들만으로
 * 동작해야 원본 userId를 URL·응답에 노출하지 않을 수 있다 (프로필 주소 래핑 정책).
 *  - 핸들 조회: users gsi1pk=`HANDLE#<handle>` (user-api repo/profile-repo.ts와 동일 키)
 *  - 프로필: pk=`USER#<userId>`, sk=`PROFILE`
 */
import { BatchGetCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

const USERS_TABLE = 'USERS_TABLE';

export interface ProfileNameEntry {
  name: string | null;
  feedHandle: string | null;
}

/**
 * 프로필 이름/핸들 배치 조회 — 운영탭 참여자 식별 표시(leaderIdentityMode) 해석용.
 * BatchGet 100개 단위, 실패 항목은 맵에서 빠진다(호출부에서 폴백 처리).
 */
export async function getProfileNamesBatch(userIds: string[]): Promise<Map<string, ProfileNameEntry>> {
  const map = new Map<string, ProfileNameEntry>();
  const unique = [...new Set(userIds.filter(Boolean))];
  const table = tableName(USERS_TABLE);
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const res = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [table]: {
            Keys: chunk.map((id) => ({ pk: `USER#${id}`, sk: 'PROFILE' })),
            ProjectionExpression: 'userId, #n, feedHandle',
            ExpressionAttributeNames: { '#n': 'name' },
          },
        },
      }),
    );
    for (const item of res.Responses?.[table] ?? []) {
      map.set(String(item.userId), {
        name: typeof item.name === 'string' ? item.name : null,
        feedHandle: typeof item.feedHandle === 'string' ? item.feedHandle : null,
      });
    }
  }
  return map;
}

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

/**
 * 경로 파라미터 해석 — `@handle`이면 핸들 조회, 아니면 userId 그대로.
 * (레거시 호환: 로그인 화면은 프로필 응답의 userId로 콘텐츠 API를 호출한다)
 */
export async function resolveUserParam(param: string): Promise<string | null> {
  if (param.startsWith('@')) return resolveHandleToUserId(param);
  return param || null;
}

/** 유저 PROFILE 아이템의 publicProfile 맵 (없으면 null) */
export async function getPublicProfileMeta(
  userId: string,
): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(USERS_TABLE),
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      ProjectionExpression: 'publicProfile, feedHandle',
    }),
  );
  const profile = res.Item;
  if (!profile) return null;
  return { publicProfile: profile.publicProfile ?? null, feedHandle: profile.feedHandle ?? null };
}
