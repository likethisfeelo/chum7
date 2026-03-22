import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const MAX_BATCH_SIZE = 50;

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

function parseCheerIds(body: string | null): string[] {
  if (!body) return [];
  const parsed = JSON.parse(body);
  if (!Array.isArray(parsed.cheerIds)) return [];
  const ids = parsed.cheerIds
    .map((value: unknown) => String(value || '').trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

async function requeueOne(cheerId: string, actorId: string): Promise<{ cheerId: string; ok: boolean; error?: string }> {
  const deadLetterResult = await docClient.send(new GetCommand({
    TableName: process.env.CHEER_DEAD_LETTERS_TABLE!,
    Key: { cheerId },
  }));

  const deadLetter = deadLetterResult.Item;
  if (!deadLetter || deadLetter.status !== 'dead') {
    return {
      cheerId,
      ok: false,
      error: 'DEAD_LETTER_NOT_FOUND',
    };
  }

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

    return {
      cheerId,
      ok: true,
    };
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException' || error?.name === 'TransactionCanceledException') {
      return {
        cheerId,
        ok: false,
        error: 'REQUEUE_CONFLICT',
      };
    }

    return {
      cheerId,
      ok: false,
      error: 'REQUEUE_FAILED',
    };
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!hasOpsRole(event)) {
      return response(403, { error: 'FORBIDDEN' });
    }

    let cheerIds: string[] = [];
    try {
      cheerIds = parseCheerIds(event.body || null);
    } catch {
      return response(400, {
        error: 'INVALID_BODY',
        message: '요청 본문 형식이 올바르지 않습니다',
      });
    }

    if (cheerIds.length === 0) {
      return response(400, {
        error: 'INVALID_CHEER_IDS',
        message: 'cheerIds 배열이 필요합니다',
      });
    }

    if (cheerIds.length > MAX_BATCH_SIZE) {
      return response(400, {
        error: 'BATCH_LIMIT_EXCEEDED',
        message: `한 번에 최대 ${MAX_BATCH_SIZE}건까지 재처리 가능합니다`,
      });
    }

    const actorId = getActorId(event);
    const results = [] as Array<{ cheerId: string; ok: boolean; error?: string }>;
    for (const cheerId of cheerIds) {
      const result = await requeueOne(cheerId, actorId);
      results.push(result);
    }

    const successCount = results.filter((result) => result.ok).length;

    return response(200, {
      success: true,
      data: {
        total: cheerIds.length,
        successCount,
        failCount: cheerIds.length - successCount,
        results,
      },
    });
  } catch (error: any) {
    console.error('Admin dead-letter batch requeue error:', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
