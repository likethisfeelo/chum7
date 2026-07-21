/**
 * 사용자 응원 통계 — pk=`STATS#<userId>`/sk=`META` (이전 가이드 §3 cheer 키 설계).
 * 레거시 cheer-stats-materializer(풀스캔 배치) 대체: 액션 시점 UpdateCommand ADD 증분(업서트).
 * 증분 실패는 본 요청을 실패시키지 않는 best-effort (경고 로그만 — PORTING.md §5).
 */
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { META_SK, TABLE, statsPk } from './shared';
import type { StatsIncrement } from '../domain/stats-rules';

/** 카운터 ADD 업서트 (아이템 부재 시 자동 생성 — ADD 시맨틱) */
export async function addUserStats(increment: StatsIncrement, nowIso: string): Promise<void> {
  const entries = Object.entries(increment.add).filter(
    ([, value]) => Number.isFinite(value) && value !== 0,
  );
  if (entries.length === 0) return;

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':now': nowIso, ':userId': increment.userId };
  const addParts: string[] = [];
  entries.forEach(([field, value], index) => {
    names[`#f${index}`] = field;
    values[`:v${index}`] = value;
    addParts.push(`#f${index} :v${index}`);
  });

  await docClient.send(
    new UpdateCommand({
      TableName: tableName(TABLE),
      Key: { pk: statsPk(increment.userId), sk: META_SK },
      UpdateExpression: `ADD ${addParts.join(', ')} SET updatedAt = :now, userId = if_not_exists(userId, :userId)`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/** 증분 목록 best-effort 반영 — 실패해도 throw하지 않음 (v1 허용 오차, PORTING.md §5) */
export async function applyStatsIncrements(increments: StatsIncrement[], nowIso: string): Promise<void> {
  const results = await Promise.allSettled(increments.map((inc) => addUserStats(inc, nowIso)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Failed to apply cheer stats increment',
        userId: increments[index]?.userId,
        error: (result.reason as Error | undefined)?.message ?? String(result.reason),
      }));
    }
  });
}

export async function getUserStats(userId: string): Promise<Record<string, any> | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: statsPk(userId), sk: META_SK } }),
  );
  return res.Item;
}
