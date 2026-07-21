/**
 * cheer 테이블 액세스 (이전 가이드 §3 cheer 키 설계 준수 — 풀스캔 금지).
 * - 응원 META: pk=`CHEER#<cheerId>`/sk=`META`, gsi1=RECV#/createdAt, 예약분 gsi2=SCHED#<status>/scheduledTime
 * - 발신 조회: SENT 프로젝션 아이템 pk=`CHEER#<cheerId>`/sk=`SENDER`, gsi1=SENT#<senderId>/createdAt
 */
import { BatchGetCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { META_SK, SENDER_SK, TABLE, cheerPk, recvGsi1Pk, schedGsi2Pk, sentGsi1Pk } from './shared';

export async function putCheerWithProjection(
  meta: Record<string, any>,
  sentProjection: Record<string, any>,
): Promise<void> {
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: meta }));
  await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: sentProjection }));
}

export async function getCheer(cheerId: string): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: cheerPk(cheerId), sk: META_SK } }),
  );
  return res.Item;
}

/** 받은 응원 — gsi1 RECV#<receiverId> 최신순 (레거시 receiverId-index 대응) */
export async function listReceivedCheers(receiverId: string, limit: number): Promise<Record<string, any>[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': recvGsi1Pk(receiverId) },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return res.Items ?? [];
}

/** 보낸 응원 포인터 — gsi1 SENT#<senderId> 최신순 (레거시 senderId-index 대응) */
export async function listSentPointers(
  senderId: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
): Promise<{ items: Record<string, any>[]; lastKey?: Record<string, any> }> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': sentGsi1Pk(senderId) },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** cheerId 목록 → META BatchGet (100건 청크) */
export async function batchGetCheers(cheerIds: string[]): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  for (let i = 0; i < cheerIds.length; i += 100) {
    const chunk = cheerIds.slice(i, i + 100);
    if (chunk.length === 0) continue;
    const res = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName(TABLE)]: { Keys: chunk.map((id) => ({ pk: cheerPk(id), sk: META_SK })) },
        },
      }),
    );
    items.push(...((res.Responses?.[tableName(TABLE)] ?? []) as Record<string, any>[]));
  }
  return items;
}

/** 읽음 처리 — 레거시 get-my-cheers의 조건부 갱신 승계 */
export async function markCheerRead(cheerId: string, receiverId: string, readAt: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: cheerPk(cheerId), sk: META_SK },
      UpdateExpression: 'SET isRead = :true, readAt = :readAt',
      ConditionExpression: 'attribute_exists(pk) AND receiverId = :receiverId AND (attribute_not_exists(isRead) OR isRead = :false)',
      ExpressionAttributeValues: { ':true': true, ':false': false, ':receiverId': receiverId, ':readAt': readAt },
    }),
  );
}

/** 리액션 — 레거시 react 조건부 갱신 승계 */
export async function setReaction(cheerId: string, receiverId: string, reactionType: string, now: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: cheerPk(cheerId), sk: META_SK },
      UpdateExpression: 'SET reactionType = :reactionType, reactedAt = :now',
      ConditionExpression: '(attribute_not_exists(reactionType) OR reactionType = :null) AND receiverId = :receiverId',
      ExpressionAttributeValues: { ':reactionType': reactionType, ':now': now, ':null': null, ':receiverId': receiverId },
    }),
  );
}

/** 답장 — 레거시 reply 조건부 갱신 승계 */
export async function setReply(cheerId: string, receiverId: string, message: string, now: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: cheerPk(cheerId), sk: META_SK },
      UpdateExpression: 'SET replyMessage = :message, repliedAt = :now',
      ConditionExpression: '(attribute_not_exists(replyMessage) OR replyMessage = :null) AND receiverId = :receiverId',
      ExpressionAttributeValues: { ':message': message, ':now': now, ':null': null, ':receiverId': receiverId },
    }),
  );
}

/** 감사 메시지 — 발신자 본인 + 점수 적립분만 (레거시 receiverId 조건 결함 수정, PORTING.md §4) */
export async function setThankMessage(cheerId: string, senderId: string, message: string, now: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: cheerPk(cheerId), sk: META_SK },
      UpdateExpression: 'SET thankMessage = :message, thankMessageAt = :now, isThanked = :true, thankedAt = :now',
      ConditionExpression: 'senderId = :senderId AND isThankScoreGranted = :granted',
      ExpressionAttributeValues: { ':message': message, ':now': now, ':senderId': senderId, ':true': true, ':granted': true },
    }),
  );
}

/** 예약 취소 — pending 조건부 갱신 + gsi2 상태 파티션 동기 */
export async function cancelScheduledCheer(cheerId: string, now: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: cheerPk(cheerId), sk: META_SK },
      UpdateExpression: 'SET #status = :cancelled, cancelledAt = :now, gsi2pk = :gsi2pk',
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':cancelled': 'cancelled',
        ':pending': 'pending',
        ':now': now,
        ':gsi2pk': schedGsi2Pk('cancelled'),
      },
    }),
  );
}
