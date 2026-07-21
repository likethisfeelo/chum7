import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * users 테이블 — Web Push 구독 (이전 가이드 §3 users).
 *  pk=`USER#<userId>`, sk=`PUSH#<endpointHash>` (sha256(endpoint) hex 앞 16자)
 */
const TABLE = 'USERS_TABLE';

export async function putPushSubscription(
  userId: string,
  endpointId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  nowIso: string,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: {
        pk: `USER#${userId}`,
        sk: `PUSH#${endpointId}`,
        endpointId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    }),
  );
}

export async function deletePushSubscription(userId: string, endpointId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName(TABLE),
      Key: { pk: `USER#${userId}`, sk: `PUSH#${endpointId}` },
    }),
  );
}
