/**
 * social 테이블 — 콘텐츠 신고(report) 큐.
 *  신고:      pk=`REPORTS`, sk=`<createdAt>#<reportId>` (파티션 단일, 최신순 Query)
 *  중복방지:  pk=`REPORTDEDUP#<reporterId>`, sk=`<targetType>#<targetId>` (조건부 put)
 * 관리자 신고큐는 status 속성으로 필터(pending/actioned/dismissed).
 */
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';
import { TABLE } from './shared';

const REPORTS_PK = 'REPORTS';
const reportSk = (createdAt: string, reportId: string) => `${createdAt}#${reportId}`;
const dedupPk = (reporterId: string) => `REPORTDEDUP#${reporterId}`;
const dedupSk = (targetType: string, targetId: string) => `${targetType}#${targetId}`;

export interface ReportItem {
  reportId: string;
  status: 'pending' | 'actioned' | 'dismissed';
  targetType: 'verification' | 'plaza' | 'comment';
  targetId: string;
  challengeId?: string | null;
  plazaPostId?: string | null;
  commentCreatedAt?: string | null;
  reason: string;
  detail?: string | null;
  reporterId: string;
  targetOwnerId?: string | null;
  contentPreview?: string | null;
  createdAt: string;
}

/** 같은 신고자·같은 대상 재신고 여부 (true면 이미 신고함) */
export async function hasReported(
  reporterId: string,
  targetType: string,
  targetId: string,
): Promise<boolean> {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName(TABLE),
      Key: { pk: dedupPk(reporterId), sk: dedupSk(targetType, targetId) },
    }),
  );
  return Boolean(res.Item);
}

export async function putReport(item: ReportItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(TABLE),
      Item: { ...item, pk: REPORTS_PK, sk: reportSk(item.createdAt, item.reportId) },
    }),
  );
  // 중복 신고 마커 (실패는 무시)
  await docClient
    .send(
      new PutCommand({
        TableName: tableName(TABLE),
        Item: {
          pk: dedupPk(item.reporterId),
          sk: dedupSk(item.targetType, item.targetId),
          reportId: item.reportId,
          createdAt: item.createdAt,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    )
    .catch((err: any) => {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
    });
}

/** 신고 목록 — 최신순, status 필터(옵션) */
export async function listReports(status?: string, limit = 200): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName(TABLE),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': REPORTS_PK },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey && items.length < limit * 3);
  const filtered = status && status !== 'all' ? items.filter((r) => r.status === status) : items;
  return filtered.slice(0, limit);
}

export async function getReport(createdAt: string, reportId: string): Promise<Record<string, any> | null> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(TABLE), Key: { pk: REPORTS_PK, sk: reportSk(createdAt, reportId) } }),
  );
  return res.Item ?? null;
}

export async function updateReportStatus(
  createdAt: string,
  reportId: string,
  status: 'actioned' | 'dismissed',
  reviewerId: string,
  note?: string,
): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(TABLE),
        Key: { pk: REPORTS_PK, sk: reportSk(createdAt, reportId) },
        UpdateExpression: 'SET #s = :s, reviewedBy = :r, reviewedAt = :t, reviewNote = :n',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': status,
          ':r': reviewerId,
          ':t': new Date().toISOString(),
          ':n': note ?? null,
        },
        ConditionExpression: 'attribute_exists(pk)',
      }),
    );
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}
