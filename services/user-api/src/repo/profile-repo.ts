import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * users 테이블 — 프로필 아이템 확장 액세스 (기존 users-repo.ts 는 그대로 두고 확장).
 *  - 프로필: pk=`USER#<userId>`, sk=`PROFILE`
 *  - 핸들 조회: gsi1pk=`HANDLE#<feedHandle>`, gsi1sk=`USER`
 * 피드 관련 부가 필드(feedHandle/feedHandleUpdatedAt/feedSettings)도 PROFILE 아이템에 저장.
 */
const TABLE = 'USERS_TABLE';
const SK_PROFILE = 'PROFILE';

export type ProfileItem = Record<string, unknown>;

function profileKey(userId: string) {
  return { pk: `USER#${userId}`, sk: SK_PROFILE };
}

/** 프로필 아이템 원본 조회 (feedSettings·feedHandle 등 포함) */
export async function getProfileItem(userId: string): Promise<ProfileItem | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: profileKey(userId) }),
  );
  return res.Item as ProfileItem | undefined;
}

/** 핸들로 프로필 조회 (gsi1pk=HANDLE#<handle>) */
export async function getProfileItemByHandle(handle: string): Promise<ProfileItem | undefined> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :h',
      ExpressionAttributeValues: { ':h': `HANDLE#${handle}` },
      Limit: 1,
    }),
  );
  return res.Items?.[0] as ProfileItem | undefined;
}

export interface ProfileFieldUpdates {
  name?: string;
  profileImageUrl?: string | null;
  identityPhrase?: string;
}

/** 레거시 auth/update-profile 의 동적 UpdateExpression 그대로 + 갱신본 반환 */
export async function updateProfileFields(
  userId: string,
  input: ProfileFieldUpdates,
  now: Date,
): Promise<ProfileItem | undefined> {
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  if (input.name !== undefined) {
    updateExpressions.push('#name = :name');
    expressionAttributeNames['#name'] = 'name';
    expressionAttributeValues[':name'] = input.name;
  }
  if (input.profileImageUrl !== undefined) {
    updateExpressions.push('profileImageUrl = :profileImageUrl');
    expressionAttributeValues[':profileImageUrl'] = input.profileImageUrl;
  }
  if (input.identityPhrase !== undefined) {
    updateExpressions.push('identityPhrase = :identityPhrase');
    expressionAttributeValues[':identityPhrase'] = input.identityPhrase;
  }

  updateExpressions.push('updatedAt = :updatedAt');
  expressionAttributeValues[':updatedAt'] = now.toISOString();

  const res = await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: profileKey(userId),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames:
        Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }),
  );
  return res.Attributes as ProfileItem | undefined;
}

/** 핸들 설정 — PROFILE 아이템에 feedHandle + gsi1 키 기록 */
export async function setFeedHandle(userId: string, handle: string, nowIso: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: profileKey(userId),
      UpdateExpression:
        'SET feedHandle = :h, feedHandleUpdatedAt = :now, gsi1pk = :gpk, gsi1sk = :gsk',
      ExpressionAttributeValues: {
        ':h': handle,
        ':now': nowIso,
        ':gpk': `HANDLE#${handle}`,
        ':gsk': 'USER',
      },
    }),
  );
}

/**
 * 공개 프로필 저장 — PROFILE 아이템의 publicProfile 맵 전체 교체.
 *  { enabled, displayName|null, bio|null, featuredIds[] (≤6) }
 *  리더 모객용 공개 페이지(/p/@handle) 데이터. challenge-api가 read-only로 읽는다.
 */
export async function setPublicProfile(
  userId: string,
  publicProfile: {
    enabled: boolean;
    displayName: string | null;
    bio: string | null;
    featuredIds: string[];
  },
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: profileKey(userId),
      UpdateExpression: 'SET publicProfile = :pp',
      ExpressionAttributeValues: { ':pp': publicProfile },
    }),
  );
}

/** 온보딩 완료 기록 — 완료 시각 + 선택한 관심 카테고리(탐색 초기값·추천 시드) */
export async function setOnboarded(
  userId: string,
  interests: string[],
  nowIso: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: profileKey(userId),
      UpdateExpression: 'SET onboardedAt = :now, onboardingInterests = :interests',
      ExpressionAttributeValues: { ':now': nowIso, ':interests': interests },
    }),
  );
}

/** 피드 공개 설정 저장 (레거시 personal-feed/settings 병합 결과 전체 교체) */
export async function setFeedSettings(
  userId: string,
  settings: Record<string, boolean>,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: profileKey(userId),
      UpdateExpression: 'SET feedSettings = :settings',
      ExpressionAttributeValues: { ':settings': settings },
    }),
  );
}
