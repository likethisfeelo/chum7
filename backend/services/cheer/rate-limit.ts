import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

type AcquireRateLimitInput = {
  action: string;
  userId: string;
  limit: number;
  windowSeconds: number;
  docClient: DynamoDBDocumentClient;
  tableName?: string;
};

type AcquireRateLimitResult = {
  allowed: boolean;
  mode: 'atomic_table' | 'disabled';
  limit: number;
  current: number;
  windowSeconds: number;
};

function resolveWindowStart(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

export async function acquireRateLimitSlot(input: AcquireRateLimitInput): Promise<AcquireRateLimitResult> {
  const { action, userId, limit, windowSeconds, docClient, tableName } = input;

  if (!tableName) {
    return {
      allowed: false,
      mode: 'disabled',
      limit,
      current: 0,
      windowSeconds
    };
  }

  const now = Date.now();
  const windowStartMs = resolveWindowStart(now, windowSeconds);
  const windowStartIso = new Date(windowStartMs).toISOString();
  const expireAt = Math.floor((windowStartMs + (windowSeconds * 1000 * 2)) / 1000);
  const rateKey = `${action}#${userId}#${windowStartIso}`;

  try {
    const updated = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { rateKey },
      UpdateExpression: 'ADD requestCount :one SET expireAt = :expireAt, updatedAt = :updatedAt',
      ConditionExpression: 'attribute_not_exists(rateKey) OR requestCount < :limit',
      ExpressionAttributeValues: {
        ':one': 1,
        ':limit': limit,
        ':expireAt': expireAt,
        ':updatedAt': new Date(now).toISOString()
      },
      ReturnValues: 'UPDATED_NEW'
    }));

    const current = Number((updated.Attributes as any)?.requestCount ?? 1);
    return {
      allowed: true,
      mode: 'atomic_table',
      limit,
      current,
      windowSeconds
    };
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return {
        allowed: false,
        mode: 'atomic_table',
        limit,
        current: limit,
        windowSeconds
      };
    }

    throw error;
  }
}
