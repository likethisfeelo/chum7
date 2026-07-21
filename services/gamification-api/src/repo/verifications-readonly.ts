import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import type { PublicVerificationLike } from '../domain/world-summary';

/**
 * challenges 테이블 읽기 전용 액세스 — 문서화된 크로스 도메인 예외 (이전 가이드 §4):
 * "gamification-api → challenges 테이블 read-only (오늘 탭 world-summary가 당일 인증 집계)".
 *
 * 공개 인증: gsi2pk=`VFPUB#<YYYY-MM-DD>`(KST), gsi2sk=`<createdAt>` — 당일 파티션만 Query.
 * 쓰기 금지. 이 파일 외부에서 CHALLENGES_TABLE 접근 금지.
 */
const TABLE = 'CHALLENGES_TABLE';

/** KST 기준 당일 공개 인증 전체 (집계용 최소 속성만 투영) */
export async function listTodayPublicVerifications(
  kstDate: string,
): Promise<PublicVerificationLike[]> {
  const items: PublicVerificationLike[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :pk',
        ExpressionAttributeValues: { ':pk': `VFPUB#${kstDate}` },
        ProjectionExpression: '#cc, #cat, #sc',
        ExpressionAttributeNames: {
          '#cc': 'challengeCategory',
          '#cat': 'category',
          '#sc': 'score',
        },
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((res.Items ?? []) as PublicVerificationLike[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}
