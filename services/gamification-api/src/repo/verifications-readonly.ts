import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import type { PublicVerificationLike } from '../domain/world-summary';

/**
 * challenges 테이블 읽기 전용 액세스 — 문서화된 크로스 도메인 예외 (이전 가이드 §4):
 * "gamification-api → challenges 테이블 read-only" (오늘 탭 world-summary 당일 인증 집계 +
 * 퍼블릭 업적 조회의 참여/인증/리더 이력 집계 — PORTING.md §7).
 *
 * 공개 인증: gsi2pk=`VFPUB#<YYYY-MM-DD>`(KST), gsi2sk=`<createdAt>` — 당일 파티션만 Query.
 * 참여: gsi1pk=`UCUSER#<userId>` / 인증: gsi1pk=`VFUSER#<userId>` / 개설: gsi2pk=`CREATOR#<userId>`.
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

// ── 퍼블릭 업적 집계용 read-only Query (레거시 personal-feed/achievements 대응) ──

async function queryAll(
  params: {
    IndexName: string;
    pkValue: string;
    ProjectionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
  },
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        IndexName: params.IndexName,
        KeyConditionExpression: params.IndexName === 'gsi1' ? 'gsi1pk = :pk' : 'gsi2pk = :pk',
        ExpressionAttributeValues: { ':pk': params.pkValue },
        ProjectionExpression: params.ProjectionExpression,
        ExpressionAttributeNames: params.ExpressionAttributeNames,
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...((res.Items ?? []) as Record<string, unknown>[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

/** 참여 요약 — gsi1 UCUSER#<userId> (status/phase 만 투영, 완주/진행 집계용) */
export function listUserParticipationSummaries(userId: string): Promise<Record<string, unknown>[]> {
  return queryAll({
    IndexName: 'gsi1',
    pkValue: `UCUSER#${userId}`,
    ProjectionExpression: '#st, #ph',
    ExpressionAttributeNames: { '#st': 'status', '#ph': 'phase' },
  });
}

/** 인증 요약 — gsi1 VFUSER#<userId> (score 만 투영, 총 인증 수·점수 집계용) */
export function listUserVerificationSummaries(userId: string): Promise<Record<string, unknown>[]> {
  return queryAll({
    IndexName: 'gsi1',
    pkValue: `VFUSER#${userId}`,
    ProjectionExpression: '#sc',
    ExpressionAttributeNames: { '#sc': 'score' },
  });
}

/** 개설 챌린지 — gsi2 CREATOR#<userId> (리더 이력 집계용 최소 속성) */
export function listCreatedChallenges(userId: string): Promise<Record<string, unknown>[]> {
  return queryAll({
    IndexName: 'gsi2',
    pkValue: `CREATOR#${userId}`,
    ProjectionExpression: 'challengeId, title, lifecycle, durationDays, createdAt, #stats',
    ExpressionAttributeNames: { '#stats': 'stats' },
  });
}
