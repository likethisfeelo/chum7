import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SCAN_PAGES = 20;

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function parseGroups(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,:]/)
    .map((value) => value.replace(/[\[\]"']/g, '').trim())
    .filter(Boolean);
}

function hasOpsRole(event: APIGatewayProxyEvent): boolean {
  const groups = parseGroups(event.requestContext.authorizer?.jwt?.claims['cognito:groups']);
  return groups.some((group) => ['admins', 'productowners', 'managers'].includes(group));
}

function getActorId(event: APIGatewayProxyEvent): string {
  const claims = event.requestContext.authorizer?.jwt?.claims || {};
  return String(claims.sub || claims.email || 'unknown');
}

function parseIsoOrNull(value?: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

type RequeueQueryBody = {
  fromIso?: string;
  toIso?: string;
  failureCode?: string;
  limit?: number;
  dryRun?: boolean;
};

function parseBody(body: string | null): RequeueQueryBody {
  if (!body) return {};
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed;
}

async function requeueOne(cheerId: string, actorId: string): Promise<{ cheerId: string; ok: boolean; error?: string }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const requeueScheduledTime = new Date(now.getTime() + 60 * 1000).toISOString();

  try {
    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: process.env.CHEERS_TABLE!,
            Key: { cheerId },
            UpdateExpression: 'SET #status = :pending, retryCount = :retryCount, scheduledTime = :scheduledTime, nextRetryAt = :nextRetryAt, requeuedAt = :requeuedAt REMOVE deadLetterReason, failureCode, failedAt',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':pending': 'pending',
              ':retryCount': 0,
              ':scheduledTime': requeueScheduledTime,
              ':nextRetryAt': requeueScheduledTime,
              ':requeuedAt': nowIso,
            },
            ConditionExpression: 'attribute_exists(cheerId)',
          },
        },
        {
          Update: {
            TableName: process.env.CHEER_DEAD_LETTERS_TABLE!,
            Key: { cheerId },
            UpdateExpression: 'SET #status = :status, requeuedAt = :requeuedAt, requeuedBy = :requeuedBy',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':status': 'requeued',
              ':requeuedAt': nowIso,
              ':requeuedBy': actorId,
              ':dead': 'dead',
            },
            ConditionExpression: '#status = :dead',
          },
        },
      ],
    }));

    return { cheerId, ok: true };
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException' || error?.name === 'TransactionCanceledException') {
      return { cheerId, ok: false, error: 'REQUEUE_CONFLICT' };
    }
    return { cheerId, ok: false, error: 'REQUEUE_FAILED' };
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!hasOpsRole(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    let body: RequeueQueryBody = {};
    try {
      body = parseBody(event.body || null);
    } catch {
      return response(400, {
        error: 'INVALID_BODY',
        message: '요청 본문 형식이 올바르지 않습니다',
      });
    }

    const parsedFrom = parseIsoOrNull(body.fromIso);
    const parsedTo = parseIsoOrNull(body.toIso) ?? new Date().toISOString();

    if ((body.fromIso && !parsedFrom) || (body.toIso && !parseIsoOrNull(body.toIso))) {
      return response(400, {
        error: 'INVALID_ISO_RANGE',
        message: 'fromIso/toIso는 ISO-8601 형식이어야 합니다',
      });
    }

    const fromIso = parsedFrom ?? new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const toIso = parsedTo;

    if (Date.parse(fromIso) > Date.parse(toIso)) {
      return response(400, {
        error: 'INVALID_ISO_RANGE',
        message: 'fromIso는 toIso보다 이후일 수 없습니다',
      });
    }

    const limit = Math.min(Math.max(Number(body.limit || DEFAULT_LIMIT), 1), MAX_LIMIT);
    const failureCode = String(body.failureCode || '').trim() || null;
    const dryRun = Boolean(body.dryRun);

    const candidates: any[] = [];
    let lastKey: Record<string, any> | undefined;
    let pageCount = 0;

    do {
      const result = await docClient.send(new QueryCommand({
        TableName: process.env.CHEER_DEAD_LETTERS_TABLE!,
        IndexName: 'failedAt-index',
        KeyConditionExpression: '#status = :status AND failedAt BETWEEN :from AND :to',
        FilterExpression: failureCode ? 'failureCode = :failureCode' : undefined,
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'dead',
          ':from': fromIso,
          ':to': toIso,
          ...(failureCode ? { ':failureCode': failureCode } : {}),
        },
        ScanIndexForward: false,
        ExclusiveStartKey: lastKey,
      }));

      const items = (result.Items || []) as Array<Record<string, any>>;
      for (const item of items) {
        candidates.push(item);
        if (candidates.length >= limit) {
          break;
        }
      }

      if (candidates.length >= limit) {
        break;
      }

      lastKey = result.LastEvaluatedKey as Record<string, any> | undefined;
      pageCount += 1;
    } while (lastKey && pageCount < MAX_SCAN_PAGES);

    if (dryRun) {
      return response(200, {
        success: true,
        data: {
          dryRun: true,
          range: { fromIso, toIso },
          filter: { failureCode },
          matchedCount: candidates.length,
          candidateCheerIds: candidates.map((item) => item.cheerId),
        },
      });
    }

    const actorId = getActorId(event);
    const results = [] as Array<{ cheerId: string; ok: boolean; error?: string }>;
    for (const item of candidates) {
      results.push(await requeueOne(String(item.cheerId), actorId));
    }

    const successCount = results.filter((result) => result.ok).length;

    return response(200, {
      success: true,
      data: {
        dryRun: false,
        range: { fromIso, toIso },
        filter: { failureCode },
        total: results.length,
        successCount,
        failCount: results.length - successCount,
        results,
      },
    });
  } catch (error: any) {
    console.error('Admin dead-letter requeue-by-query error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
