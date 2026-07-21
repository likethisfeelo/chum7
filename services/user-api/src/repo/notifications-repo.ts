import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * users 테이블 — 인앱 알림·알림 설정 (이전 가이드 §3 users).
 *  - 알림:      pk=`USER#<userId>`, sk=`NOTIF#<ISO ts>#<id>` (sk 역순 Query)
 *  - 알림 설정: pk=`USER#<userId>`, sk=`SETTINGS#notifications`
 * 알림 기록은 notification-worker 책임 — 이 API는 조회/읽음 처리만.
 */
const TABLE = 'USERS_TABLE';
const SK_SETTINGS = 'SETTINGS#notifications';

export interface NotificationItem extends Record<string, unknown> {
  notificationId: string;
  isRead?: boolean;
  createdAt?: string;
}

export async function listNotifications(
  userId: string,
  limit: number,
  exclusiveStartKey?: Record<string, unknown>,
): Promise<{ items: NotificationItem[]; lastKey?: Record<string, unknown> }> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'NOTIF#' },
      ScanIndexForward: false, // 최신순 (sk = NOTIF#<ISO ts>#<id>)
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return {
    items: (res.Items ?? []) as NotificationItem[],
    lastKey: res.LastEvaluatedKey,
  };
}

/** notificationId(`<ISO ts>#<id>`)는 sk 접미사와 동일 — 직접 Get */
export async function getNotification(
  userId: string,
  notificationId: string,
): Promise<NotificationItem | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${userId}`, sk: `NOTIF#${notificationId}` },
    }),
  );
  return res.Item as NotificationItem | undefined;
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${userId}`, sk: `NOTIF#${notificationId}` },
      UpdateExpression: 'SET isRead = :r',
      ExpressionAttributeValues: { ':r': true },
    }),
  );
}

export async function getNotificationSettings(
  userId: string,
): Promise<Record<string, boolean> | undefined> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${userId}`, sk: SK_SETTINGS },
    }),
  );
  return res.Item?.settings as Record<string, boolean> | undefined;
}

export async function putNotificationSettings(
  userId: string,
  settings: Record<string, boolean>,
  nowIso: string,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `USER#${userId}`,
        sk: SK_SETTINGS,
        settings,
        updatedAt: nowIso,
      },
    }),
  );
}
