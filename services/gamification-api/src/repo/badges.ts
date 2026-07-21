import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import type { BadgeRecordLike } from '../domain/views';

/**
 * gamification 테이블 — 뱃지 (키 설계: 이전 가이드 §3 gamification).
 *  pk=`USER#<userId>`, sk=`BADGE#<badgeId>` (+ gsi1pk=`BADGE#<badgeId>`, gsi1sk=`<grantedAt>`)
 *  레거시 badges 테이블(PK badgeId + SK userId, userId-index Query) 대응.
 *  기록(부여)은 lifecycle-manager 워커 책임 — 이 API는 조회 전용.
 */
const TABLE = 'GAMIFICATION_TABLE';

export async function listBadges(userId: string): Promise<BadgeRecordLike[]> {
  const items: BadgeRecordLike[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'BADGE#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((res.Items ?? []) as BadgeRecordLike[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
