import { BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

type AcquireRateLimitInput = {
  action: string;
  userId: string;
  limit: number;
  windowSeconds: number;
  docClient: { send(command: unknown): Promise<any> };
  tableName?: string;
};

type AcquireRateLimitResult = {
  allowed: boolean;
  mode: 'atomic_table' | 'disabled';
  strategy: 'fixed_window' | 'sliding_window_approx';
  limit: number;
  current: number;
  weightedCurrent: number;
  windowSeconds: number;
};

type RateCounterItem = {
  rateKey?: string;
  requestCount?: number;
  updatedAt?: string;
  expireAt?: number;
};

function resolveWindowStart(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

function buildRateKey(action: string, userId: string, windowStartMs: number): string {
  const windowStartIso = new Date(windowStartMs).toISOString();
  return `${action}#${userId}#${windowStartIso}`;
}

function computeSlidingUsage(currentCount: number, previousCount: number, elapsedInWindowMs: number, windowMs: number): number {
  const carryOverRatio = 1 - Math.min(Math.max(elapsedInWindowMs / windowMs, 0), 1);
  return currentCount + (previousCount * carryOverRatio);
}

async function readSlidingWindowState(input: {
  docClient: { send(command: unknown): Promise<any> };
  tableName: string;
  currentRateKey: string;
  previousRateKey: string;
}): Promise<{ currentCount: number; previousCount: number }> {
  const { docClient, tableName, currentRateKey, previousRateKey } = input;
  const result = await docClient.send(new BatchGetCommand({
    RequestItems: {
      [tableName]: {
        Keys: [{ rateKey: currentRateKey }, { rateKey: previousRateKey }],
        ProjectionExpression: 'rateKey, requestCount'
      }
    }
  }));

  const items = (result.Responses?.[tableName] as RateCounterItem[] | undefined) || [];
  const byKey = new Map(items.map((item) => [item.rateKey, Number(item.requestCount ?? 0)]));

  return {
    currentCount: byKey.get(currentRateKey) ?? 0,
    previousCount: byKey.get(previousRateKey) ?? 0
  };
}

export async function acquireRateLimitSlot(input: AcquireRateLimitInput): Promise<AcquireRateLimitResult> {
  const { action, userId, limit, windowSeconds, docClient, tableName } = input;

  if (!tableName) {
    return {
      allowed: false,
      mode: 'disabled',
      strategy: 'fixed_window',
      limit,
      current: 0,
      weightedCurrent: 0,
      windowSeconds
    };
  }

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = resolveWindowStart(now, windowSeconds);
  const previousWindowStartMs = windowStartMs - windowMs;
  const elapsedInWindowMs = now - windowStartMs;
  const expireAt = Math.floor((windowStartMs + (windowMs * 2)) / 1000);

  const currentRateKey = buildRateKey(action, userId, windowStartMs);
  const previousRateKey = buildRateKey(action, userId, previousWindowStartMs);

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { currentCount, previousCount } = await readSlidingWindowState({
      docClient,
      tableName,
      currentRateKey,
      previousRateKey
    });

    const weightedBefore = computeSlidingUsage(currentCount, previousCount, elapsedInWindowMs, windowMs);
    if (weightedBefore >= limit) {
      return {
        allowed: false,
        mode: 'atomic_table',
        strategy: 'sliding_window_approx',
        limit,
        current: currentCount,
        weightedCurrent: weightedBefore,
        windowSeconds
      };
    }

    const updatedAt = new Date(now).toISOString();

    try {
      if (currentCount === 0) {
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { rateKey: currentRateKey },
          UpdateExpression: 'SET requestCount = :one, expireAt = :expireAt, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_not_exists(rateKey)',
          ExpressionAttributeValues: {
            ':one': 1,
            ':expireAt': expireAt,
            ':updatedAt': updatedAt
          }
        }));
      } else {
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { rateKey: currentRateKey },
          UpdateExpression: 'SET requestCount = requestCount + :one, expireAt = :expireAt, updatedAt = :updatedAt',
          ConditionExpression: 'requestCount = :expectedCurrent',
          ExpressionAttributeValues: {
            ':one': 1,
            ':expectedCurrent': currentCount,
            ':expireAt': expireAt,
            ':updatedAt': updatedAt
          }
        }));
      }

      const nextCurrent = currentCount + 1;
      return {
        allowed: true,
        mode: 'atomic_table',
        strategy: 'sliding_window_approx',
        limit,
        current: nextCurrent,
        weightedCurrent: computeSlidingUsage(nextCurrent, previousCount, elapsedInWindowMs, windowMs),
        windowSeconds
      };
    } catch (error: any) {
      if (error?.name !== 'ConditionalCheckFailedException') {
        throw error;
      }

      if (attempt === maxAttempts - 1) {
        return {
          allowed: false,
          mode: 'atomic_table',
          strategy: 'sliding_window_approx',
          limit,
          current: Math.max(0, currentCount),
          weightedCurrent: Math.max(limit, weightedBefore),
          windowSeconds
        };
      }
    }
  }

  return {
    allowed: false,
    mode: 'atomic_table',
    strategy: 'sliding_window_approx',
    limit,
    current: limit,
    weightedCurrent: limit,
    windowSeconds
  };
}
