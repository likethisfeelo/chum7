/**
 * GET /personal-feed/{userId}
 *
 * 공개 레이어(L0~L4) 판단 + 기본 프로필 반환
 *
 * L0: 기본 (최소 정보만)
 * L1: feedSettings.isPublic = true → Tab 03 열람 가능
 * L2: 팔로우 요청 가능 (초대 링크 접속자 or 공통 챌린지 10회 완주 조건 충족)
 * L3: followStatus = 'accepted' → Tab 01 열람 가능
 * L4: isMutual OR feedSettings.tab02Public = true → Tab 02·04 열람 가능
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

async function getFollowStatus(
  followerId: string,
  followeeId: string,
): Promise<'none' | 'pending' | 'accepted'> {
  if (!process.env.FEED_FOLLOWS_TABLE) return 'none';
  const result = await docClient.send(new GetCommand({
    TableName: process.env.FEED_FOLLOWS_TABLE,
    Key: { followId: `${followerId}#${followeeId}` },
  }));
  if (!result.Item) return 'none';
  return result.Item.status as 'none' | 'pending' | 'accepted';
}

async function countSharedCompletedChallenges(userId1: string, userId2: string): Promise<number> {
  if (!process.env.USER_CHALLENGES_TABLE) return 0;
  const [r1, r2] = await Promise.all([
    docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'bucketState = :completed',
      ExpressionAttributeValues: { ':uid': userId1, ':completed': 'completed' },
      ProjectionExpression: 'challengeId',
    })),
    docClient.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'bucketState = :completed',
      ExpressionAttributeValues: { ':uid': userId2, ':completed': 'completed' },
      ProjectionExpression: 'challengeId',
    })),
  ]);
  const ids1 = new Set((r1.Items ?? []).map((i) => i.challengeId));
  return (r2.Items ?? []).filter((i) => ids1.has(i.challengeId)).length;
}

async function isBlocked(blockerId: string, blockedUserId: string): Promise<boolean> {
  if (!process.env.FEED_BLOCKS_TABLE) return false;
  const result = await docClient.send(new GetCommand({
    TableName: process.env.FEED_BLOCKS_TABLE,
    Key: { blockId: `${blockerId}#${blockedUserId}` },
  }));
  return !!result.Item;
}

function resolveLayer(params: {
  isOwn: boolean;
  isPublic: boolean;
  tab02Public: boolean;
  followStatus: 'none' | 'pending' | 'accepted';
  isMutual: boolean;
  isBlocked: boolean;
  hasSharedChallengeEligibility: boolean;
}): number {
  if (params.isOwn) return 4;
  if (params.isBlocked) return -1;
  if (params.followStatus === 'accepted') {
    if (params.isMutual || params.tab02Public) return 4;
    return 3;
  }
  // L2: 공통 챌린지 10회 완주 조건 충족 시 팔로우 버튼 노출
  if (params.hasSharedChallengeEligibility) return 2;
  if (params.isPublic) return 1;
  return 0;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!requesterId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const userIdParam = event.pathParameters?.userId;
    const targetUserId = userIdParam === 'me' ? requesterId : userIdParam;

    if (!targetUserId) {
      return response(400, { error: 'MISSING_USER_ID', message: 'userId가 필요합니다' });
    }

    const isOwn = targetUserId === requesterId;

    const userResult = await docClient.send(new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: targetUserId },
    }));

    if (!userResult.Item) {
      return response(404, { error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' });
    }

    const user = userResult.Item;
    const feedSettings = (user.feedSettings as Record<string, unknown>) ?? {};
    const isPublic = Boolean(feedSettings.isPublic);
    const tab02Public = Boolean(feedSettings.tab02Public);

    // 타인 피드 접근 시에만 팔로우/차단 상태 조회
    let followStatus: 'none' | 'pending' | 'accepted' = 'none';
    let reverseFollowStatus: 'none' | 'pending' | 'accepted' = 'none';
    let blockedByTarget = false;

    if (!isOwn) {
      [followStatus, reverseFollowStatus, blockedByTarget] = await Promise.all([
        getFollowStatus(requesterId, targetUserId),
        getFollowStatus(targetUserId, requesterId),
        isBlocked(targetUserId, requesterId),
      ]);
    }

    const isMutual = followStatus === 'accepted' && reverseFollowStatus === 'accepted';

    // 공통 챌린지 10회 완주 조건(경로 B): 팔로우 관계가 없는 타인 피드만 확인
    let hasSharedChallengeEligibility = false;
    if (!isOwn && !blockedByTarget && followStatus !== 'accepted') {
      const sharedCount = await countSharedCompletedChallenges(requesterId, targetUserId);
      hasSharedChallengeEligibility = sharedCount >= 10;
    }

    const layer = resolveLayer({
      isOwn,
      isPublic,
      tab02Public,
      followStatus,
      isMutual,
      isBlocked: blockedByTarget,
      hasSharedChallengeEligibility,
    });

    if (layer === -1) {
      return response(403, { error: 'BLOCKED' });
    }

    return response(200, {
      success: true,
      data: {
        userId: user.userId,
        displayName: user.name,
        animalIcon: user.animalIcon ?? '🐰',
        isOwn,
        currentLayer: layer,
        followStatus,
        isMutual,
        feedSettings: {
          isPublic,
          tab02Public,
        },
      },
    });
  } catch (error) {
    console.error('[personal-feed/profile] error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
