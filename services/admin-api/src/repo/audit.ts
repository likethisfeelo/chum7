/**
 * ops 테이블 — 감사 로그 (키 설계: 이전 가이드 §3 ops).
 *  pk=`AUDIT#<YYYY-MM>`, sk=`<ISO ts>#<id>`, gsi1pk=`AUDITTARGET#<targetId>`, gsi1sk=`<ts>`
 * 모든 변이 어드민 라우트가 recordAudit로 기록한다 (레거시 payout-audit 패턴 일반화).
 */
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { docClient, tableName } from '@chum7/api-kit';
import { buildAuditItem } from '../domain/audit';

const TABLE = 'OPS_TABLE';

export interface RecordAuditInput {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  payload?: unknown;
  now: Date;
}

/**
 * 감사 로그 기록 — 감사 실패가 본 업무 흐름을 실패시키지 않도록 오류는 로깅만 한다.
 * (이벤트 발행과 동일한 통지 성격 — REDESIGN_PLAN §3.2 준용)
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const item = buildAuditItem({ ...input, id: randomUUID() });
    await docClient.send(new PutCommand({ TableName: tableName(TABLE), Item: item }));
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'recordAudit failed',
        action: input.action,
        targetId: input.targetId,
        error: (error as Error).message,
      }),
    );
  }
}

export interface AuditPage {
  items: Record<string, any>[];
  lastKey?: Record<string, any>;
}

/** 월 파티션 조회 — pk=AUDIT#<YYYY-MM> 최신순 */
export async function listAuditByMonth(
  month: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
): Promise<AuditPage> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `AUDIT#${month}` },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}

/** 대상별 조회 — gsi1pk=AUDITTARGET#<targetId> 최신순 */
export async function listAuditByTarget(
  targetId: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
): Promise<AuditPage> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: tableName(TABLE),
      IndexName: 'gsi1',
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': `AUDITTARGET#${targetId}` },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return { items: res.Items ?? [], lastKey: res.LastEvaluatedKey };
}
