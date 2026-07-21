/**
 * 사용자 응원 통계 ADD 헬퍼 — pk=`STATS#<userId>`/sk=`META` (이전 가이드 §3 cheer 키 설계).
 * cheer-api의 repo/stats.ts와 동일 아이템을 증분한다 (크로스 서비스 import 금지 — 자체 보유).
 * 증분 실패는 발송 처리를 실패시키지 않는 best-effort (경고 로그만).
 */
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import type { StatsIncrement } from '../domain/stats-rules';

const CHEER_TABLE = 'CHEER_TABLE';

/** 카운터 ADD 업서트 (아이템 부재 시 자동 생성 — ADD 시맨틱) */
async function addUserStats(increment: StatsIncrement, nowIso: string): Promise<void> {
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
      TableName: tableName(CHEER_TABLE),
      Key: { pk: `STATS#${increment.userId}`, sk: 'META' },
      UpdateExpression: `ADD ${addParts.join(', ')} SET updatedAt = :now, userId = if_not_exists(userId, :userId)`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/** 증분 목록 best-effort 반영 — 실패해도 throw하지 않음 (v1 허용 오차) */
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
