/**
 * notifications/settings — 알림 설정 CRUD
 *
 * 라우트:
 *   GET  /notifications/settings   현재 알림 설정 조회
 *   PUT  /notifications/settings   알림 설정 업데이트
 *
 * 설정 구조 (users 테이블 notificationSettings 필드):
 *   category_challenge: boolean    챌린지 알림 전체
 *   category_quest: boolean        퀘스트 알림 전체
 *   category_cheer: boolean        응원 알림 전체
 *   category_feed_social: boolean  피드 팔로우/초대 알림
 *   category_feed_badge: boolean   피드 뱃지 알림
 *   category_bulletin: boolean     게시판 알림
 *   type_{typeName}: boolean       개별 타입 세부 제어
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function res(statusCode: number, body: unknown): APIGatewayProxyResult {
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

// 허용된 카테고리 키
const VALID_CATEGORIES = [
  'challenge', 'quest', 'cheer',
  'feed_social', 'feed_badge',
  'bulletin', 'challenge_board', 'plaza',
];

// 허용된 타입 키 (세부 제어)
const VALID_TYPES = [
  'challenge_completed', 'challenge_failed', 'challenge_preparing',
  'challenge_start_confirmation_required', 'challenge_start_delayed',
  'join_request_auto_rejected', 'join_requests_auto_rejected',
  'join_request_approved', 'join_request_rejected',
  'quest_submission_approved', 'quest_submission_rejected',
  'quest_proposal_expired', 'new_quest_available',
  'cheer_received',
  'bulletin_comment', 'challenge_comment', 'plaza_comment',
  'feed_follow_request', 'feed_follow_accepted', 'feed_invite_link_used',
  'feed_badge_granted', 'feed_leader_badge_updated',
];

const DEFAULT_SETTINGS: Record<string, boolean> = {
  category_challenge: true,
  category_quest: true,
  category_cheer: true,
  category_feed_social: true,
  category_feed_badge: true,
  category_bulletin: true,
  category_challenge_board: true,
  category_plaza: true,
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!requesterId) return res(401, { error: 'UNAUTHORIZED' });

  const method = event.requestContext.http?.method ?? event.httpMethod;

  try {
    // ── GET /notifications/settings ────────────────────────────────────
    if (method === 'GET') {
      const result = await docClient.send(new GetCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId: requesterId },
        ProjectionExpression: 'notificationSettings',
      }));

      const saved = (result.Item?.notificationSettings as Record<string, boolean>) ?? {};

      // 기본값 병합
      const settings = { ...DEFAULT_SETTINGS, ...saved };

      return res(200, { success: true, data: { settings } });
    }

    // ── PUT /notifications/settings ────────────────────────────────────
    if (method === 'PUT') {
      let body: Record<string, unknown> = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch { /* ignore */ }

      const updates: Record<string, boolean> = {};

      // 카테고리 단위 설정
      for (const cat of VALID_CATEGORIES) {
        const key = `category_${cat}`;
        if (typeof body[key] === 'boolean') {
          updates[key] = body[key] as boolean;
        }
      }

      // 타입 단위 설정
      for (const t of VALID_TYPES) {
        const key = `type_${t}`;
        if (typeof body[key] === 'boolean') {
          updates[key] = body[key] as boolean;
        }
      }

      if (Object.keys(updates).length === 0) {
        return res(400, { error: 'NO_VALID_FIELDS' });
      }

      // notificationSettings 맵에 병합 업데이트
      const setExprParts: string[] = [];
      const names: Record<string, string> = { '#ns': 'notificationSettings' };
      const values: Record<string, unknown> = { ':now': new Date().toISOString() };

      for (const [k, v] of Object.entries(updates)) {
        const nameToken = `#f_${k.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const valueToken = `:v_${k.replace(/[^a-zA-Z0-9]/g, '_')}`;
        setExprParts.push(`#ns.${nameToken} = ${valueToken}`);
        names[nameToken] = k;
        values[valueToken] = v;
      }

      setExprParts.push('updatedAt = :now');

      await docClient.send(new UpdateCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId: requesterId },
        UpdateExpression: `SET ${setExprParts.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }));

      return res(200, { success: true, data: { updated: updates } });
    }

    return res(404, { error: 'NOT_FOUND' });
  } catch (error) {
    console.error('[notifications/settings] error', error);
    return res(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
