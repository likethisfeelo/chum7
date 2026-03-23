import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * 알림 타입 → 카테고리 매핑
 * 카테고리 단위로 ON/OFF 제어, 타입 단위로 세부 제어 가능
 */
export const NOTIFICATION_CATEGORY: Record<string, string> = {
  // 챌린지 관련
  challenge_completed: 'challenge',
  challenge_failed: 'challenge',
  challenge_preparing: 'challenge',
  challenge_start_confirmation_required: 'challenge',
  challenge_start_delayed: 'challenge',
  join_request_auto_rejected: 'challenge',
  join_requests_auto_rejected: 'challenge',
  join_request_approved: 'challenge',
  join_request_rejected: 'challenge',

  // 퀘스트 관련
  quest_submission_approved: 'quest',
  quest_submission_rejected: 'quest',
  quest_proposal_expired: 'quest',
  new_quest_available: 'quest',

  // 응원 관련
  cheer_received: 'cheer',

  // 게시판 관련
  bulletin_comment: 'bulletin',
  challenge_comment: 'challenge_board',
  plaza_comment: 'plaza',

  // 개인 피드 팔로우
  feed_follow_request: 'feed_social',
  feed_follow_accepted: 'feed_social',
  feed_invite_link_used: 'feed_social',

  // 개인 피드 업적
  feed_badge_granted: 'feed_badge',
  feed_leader_badge_updated: 'feed_badge',
};

async function isNotificationEnabled(recipientId: string, type: string): Promise<boolean> {
  const usersTable = process.env.USERS_TABLE;
  if (!usersTable) return true; // 테이블 미설정 시 허용

  try {
    const result = await docClient.send(new GetCommand({
      TableName: usersTable,
      Key: { userId: recipientId },
      ProjectionExpression: 'notificationSettings',
    }));

    const settings = result.Item?.notificationSettings as Record<string, unknown> | undefined;
    if (!settings) return true; // 설정 없으면 전체 허용

    const category = NOTIFICATION_CATEGORY[type];

    // 카테고리 단위 OFF 확인
    if (category && settings[`category_${category}`] === false) return false;

    // 타입 단위 OFF 확인
    if (settings[`type_${type}`] === false) return false;

    return true;
  } catch {
    return true; // 조회 실패 시 허용 (알림 누락 방지)
  }
}

export async function sendNotification(params: {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  relatedId: string;
  relatedType: string;
  deepLink?: string;
}): Promise<void> {
  // 알림 설정 확인
  const enabled = await isNotificationEnabled(params.recipientId, params.type);
  if (!enabled) return;

  const now = new Date().toISOString();
  await docClient.send(new PutCommand({
    TableName: process.env.NOTIFICATIONS_TABLE!,
    Item: {
      notificationId: uuidv4(),
      recipientId: params.recipientId,
      type: params.type,
      title: params.title,
      body: params.body,
      relatedId: params.relatedId,
      relatedType: params.relatedType,
      deepLink: params.deepLink,
      isRead: false,
      createdAt: now,
    },
  }));
}
