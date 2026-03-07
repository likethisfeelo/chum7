import { BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

type AcquireRateLimitInput = {
  action: string;
  userId: string;
  limit: number;
  windowSeconds: number;
  docClient: { send(command: unknown): Promise<any> };
  tableName?: string;
};

type RateLimitStrategy = 'fixed_window' | 'sliding_window_approx' | 'token_bucket_approx';

type AcquireRateLimitResult = {
  allowed: boolean;
  mode: 'atomic_table' | 'disabled';
  strategy: RateLimitStrategy;
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
  tokenBalance?: number;
  lastRefillAt?: string;
};

function resolveWindowStart(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

function buildRateKey(action: string, userId: string, windowStartMs: number): string {
  const windowStartIso = new Date(windowStartMs).toISOString();
  return `${action}#${userId}#${windowStartIso}`;
}

function buildTokenBucketRateKey(action: string, userId: string): string {
  return `${action}#${userId}#token_bucket`;
}

function computeSlidingUsage(currentCount: number, previousCount: number, elapsedInWindowMs: number, windowMs: number): number {
  const carryOverRatio = 1 - Math.min(Math.max(elapsedInWindowMs / windowMs, 0), 1);
  return currentCount + (previousCount * carryOverRatio);
}

function resolveRateLimitStrategy(): RateLimitStrategy {
  const raw = (process.env.CHEER_RATE_LIMIT_STRATEGY || '').trim().toLowerCase();
  if (raw === 'token_bucket_approx') {
    return 'token_bucket_approx';
  }

  return 'sliding_window_approx';
}

async function readItemsByKeys(
  docClient: { send(command: unknown): Promise<any> },
  tableName: string,
  keys: Array<{ rateKey: string }>
): Promise<RateCounterItem[]> {
  const result = await docClient.send(new BatchGetCommand({
    RequestItems: {
      [tableName]: {
        Keys: keys,
        ProjectionExpression: 'rateKey, requestCount, tokenBalance, lastRefillAt'
      }
    }
  }));

  return (result.Responses?.[tableName] as RateCounterItem[] | undefined) || [];
}

async function acquireSlidingWindowSlot(input: {
  action: string;
  userId: string;
  limit: number;
  windowSeconds: number;
  docClient: { send(command: unknown): Promise<any> };
  tableName: string;
}): Promise<AcquireRateLimitResult> {
  const { action, userId, limit, windowSeconds, docClient, tableName } = input;

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
    const items = await readItemsByKeys(docClient, tableName, [{ rateKey: currentRateKey }, { rateKey: previousRateKey }]);
    const byKey = new Map(items.map((item) => [item.rateKey, Number(item.requestCount ?? 0)]));
    const currentCount = byKey.get(currentRateKey) ?? 0;
    const previousCount = byKey.get(previousRateKey) ?? 0;

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

async function acquireTokenBucketSlot(input: {
  action: string;
  userId: string;
  limit: number;
  windowSeconds: number;
  docClient: { send(command: unknown): Promise<any> };
  tableName: string;
}): Promise<AcquireRateLimitResult> {
  const { action, userId, limit, windowSeconds, docClient, tableName } = input;

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const refillPerSecond = limit / windowSeconds;
  const expireAt = Math.floor((now + (windowSeconds * 1000 * 2)) / 1000);
  const tokenRateKey = buildTokenBucketRateKey(action, userId);

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const items = await readItemsByKeys(docClient, tableName, [{ rateKey: tokenRateKey }]);
    const state = items.find((item) => item.rateKey === tokenRateKey);

    const tokenBalance = Number(state?.tokenBalance ?? limit);
    const clampedTokenBalance = Number.isFinite(tokenBalance) ? Math.min(limit, Math.max(0, tokenBalance)) : limit;
    const lastRefillAt = state?.lastRefillAt;
    const lastRefillMs = lastRefillAt ? new Date(lastRefillAt).getTime() : now;
    const elapsedSeconds = Math.max(0, Number.isFinite(lastRefillMs) ? (now - lastRefillMs) / 1000 : 0);
    const refilledTokens = Math.min(limit, clampedTokenBalance + (elapsedSeconds * refillPerSecond));

    if (refilledTokens < 1) {
      return {
        allowed: false,
        mode: 'atomic_table',
        strategy: 'token_bucket_approx',
        limit,
        current: Math.ceil(limit - refilledTokens),
        weightedCurrent: limit - refilledTokens,
        windowSeconds
      };
    }

    const nextTokenBalance = refilledTokens - 1;

    try {
      if (!state?.rateKey) {
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { rateKey: tokenRateKey },
          UpdateExpression: 'SET tokenBalance = :tokenBalance, lastRefillAt = :lastRefillAt, expireAt = :expireAt, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_not_exists(rateKey)',
          ExpressionAttributeValues: {
            ':tokenBalance': nextTokenBalance,
            ':lastRefillAt': nowIso,
            ':expireAt': expireAt,
            ':updatedAt': nowIso
          }
        }));
      } else {
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { rateKey: tokenRateKey },
          UpdateExpression: 'SET tokenBalance = :tokenBalance, lastRefillAt = :lastRefillAt, expireAt = :expireAt, updatedAt = :updatedAt',
          ConditionExpression: 'tokenBalance = :expectedTokenBalance AND lastRefillAt = :expectedLastRefillAt',
          ExpressionAttributeValues: {
            ':tokenBalance': nextTokenBalance,
            ':lastRefillAt': nowIso,
            ':expireAt': expireAt,
            ':updatedAt': nowIso,
            ':expectedTokenBalance': state.tokenBalance,
            ':expectedLastRefillAt': state.lastRefillAt
          }
        }));
      }

      return {
        allowed: true,
        mode: 'atomic_table',
        strategy: 'token_bucket_approx',
        limit,
        current: Math.ceil(limit - nextTokenBalance),
        weightedCurrent: limit - nextTokenBalance,
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
          strategy: 'token_bucket_approx',
          limit,
          current: limit,
          weightedCurrent: limit,
          windowSeconds
        };
      }
    }
  }

  return {
    allowed: false,
    mode: 'atomic_table',
    strategy: 'token_bucket_approx',
    limit,
    current: limit,
    weightedCurrent: limit,
    windowSeconds
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

  const strategy = resolveRateLimitStrategy();
  if (strategy === 'token_bucket_approx') {
    return acquireTokenBucketSlot({
      action,
      userId,
      limit,
      windowSeconds,
      docClient,
      tableName
    });
  }

  return acquireSlidingWindowSlot({
    action,
    userId,
    limit,
    windowSeconds,
    docClient,
    tableName
  });
}
