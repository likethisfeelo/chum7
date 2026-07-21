/**
 * 응원 리액션/답장 레이트리밋 — 레거시 backend/services/cheer/rate-limit.ts 이식.
 * 알고리즘(sliding_window_approx 기본 / token_bucket_approx 옵션) 동작 변경 없음.
 *
 * 변경점 (PORTING.md §4):
 * - 별도 CHEER_RATE_LIMITS_TABLE → cheer 테이블 카운터 아이템으로 통합
 *   (pk=`RATE#<action>#<userId>`, sk=`W#<windowStartIso>` 또는 `TOKEN`, TTL 속성 `ttl`).
 * - 레거시의 env 조건부 receiverId-index 스캔성 폴백은 결함으로 제거 — 항상 카운터 아이템 사용.
 *   (tableName 미지정 시 disabled 거부 모드는 방어적으로 유지하되, 라우트는 항상 CHEER_TABLE을 넘긴다.)
 */
import { BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export type RateLimitDocClient = { send(command: unknown): Promise<any> };

type AcquireRateLimitInput = {
  action: string;
  userId: string;
  limit: number;
  windowSeconds: number;
  docClient: RateLimitDocClient;
  tableName?: string;
};

type RateLimitStrategy = 'fixed_window' | 'sliding_window_approx' | 'token_bucket_approx';

export type AcquireRateLimitResult = {
  allowed: boolean;
  mode: 'atomic_table' | 'disabled';
  strategy: RateLimitStrategy;
  limit: number;
  current: number;
  weightedCurrent: number;
  windowSeconds: number;
};

type RateCounterItem = {
  sk?: string;
  requestCount?: number;
  tokenBalance?: number;
  lastRefillAt?: string;
};

export function rateLimitPk(action: string, userId: string): string {
  return `RATE#${action}#${userId}`;
}

function windowSk(windowStartMs: number): string {
  return `W#${new Date(windowStartMs).toISOString()}`;
}

const TOKEN_BUCKET_SK = 'TOKEN';

function resolveWindowStart(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

function computeSlidingUsage(currentCount: number, previousCount: number, elapsedInWindowMs: number, windowMs: number): number {
  const carryOverRatio = 1 - Math.min(Math.max(elapsedInWindowMs / windowMs, 0), 1);
  return currentCount + (previousCount * carryOverRatio);
}

function resolveRateLimitStrategy(): RateLimitStrategy {
  const raw = (process.env.CHEER_RATE_LIMIT_STRATEGY || '').trim().toLowerCase();
  if (raw === 'token_bucket_approx') return 'token_bucket_approx';
  return 'sliding_window_approx';
}

async function readItemsByKeys(
  docClient: RateLimitDocClient,
  tableName: string,
  pk: string,
  sks: string[],
): Promise<RateCounterItem[]> {
  const result = await docClient.send(new BatchGetCommand({
    RequestItems: {
      [tableName]: {
        Keys: sks.map((sk) => ({ pk, sk })),
        ProjectionExpression: 'sk, requestCount, tokenBalance, lastRefillAt',
      },
    },
  }));
  return (result.Responses?.[tableName] as RateCounterItem[] | undefined) || [];
}

async function acquireSlidingWindowSlot(input: Required<Omit<AcquireRateLimitInput, 'tableName'>> & { tableName: string }): Promise<AcquireRateLimitResult> {
  const { action, userId, limit, windowSeconds, docClient, tableName } = input;

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = resolveWindowStart(now, windowSeconds);
  const previousWindowStartMs = windowStartMs - windowMs;
  const elapsedInWindowMs = now - windowStartMs;
  const ttl = Math.floor((windowStartMs + (windowMs * 2)) / 1000);

  const pk = rateLimitPk(action, userId);
  const currentSk = windowSk(windowStartMs);
  const previousSk = windowSk(previousWindowStartMs);
  const base = { mode: 'atomic_table' as const, strategy: 'sliding_window_approx' as const, limit, windowSeconds };

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const items = await readItemsByKeys(docClient, tableName, pk, [currentSk, previousSk]);
    const bySk = new Map(items.map((item) => [item.sk, Number(item.requestCount ?? 0)]));
    const currentCount = bySk.get(currentSk) ?? 0;
    const previousCount = bySk.get(previousSk) ?? 0;

    const weightedBefore = computeSlidingUsage(currentCount, previousCount, elapsedInWindowMs, windowMs);
    if (weightedBefore >= limit) {
      return { ...base, allowed: false, current: currentCount, weightedCurrent: weightedBefore };
    }

    const updatedAt = new Date(now).toISOString();
    try {
      if (currentCount === 0) {
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { pk, sk: currentSk },
          UpdateExpression: 'SET requestCount = :one, #ttl = :ttl, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_not_exists(pk)',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':one': 1, ':ttl': ttl, ':updatedAt': updatedAt },
        }));
      } else {
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { pk, sk: currentSk },
          UpdateExpression: 'SET requestCount = requestCount + :one, #ttl = :ttl, updatedAt = :updatedAt',
          ConditionExpression: 'requestCount = :expectedCurrent',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':one': 1, ':expectedCurrent': currentCount, ':ttl': ttl, ':updatedAt': updatedAt },
        }));
      }

      const nextCurrent = currentCount + 1;
      return {
        ...base,
        allowed: true,
        current: nextCurrent,
        weightedCurrent: computeSlidingUsage(nextCurrent, previousCount, elapsedInWindowMs, windowMs),
      };
    } catch (error: any) {
      if (error?.name !== 'ConditionalCheckFailedException') throw error;
      if (attempt === maxAttempts - 1) {
        return { ...base, allowed: false, current: Math.max(0, currentCount), weightedCurrent: Math.max(limit, weightedBefore) };
      }
    }
  }

  return { ...base, allowed: false, current: limit, weightedCurrent: limit };
}

async function acquireTokenBucketSlot(input: Required<Omit<AcquireRateLimitInput, 'tableName'>> & { tableName: string }): Promise<AcquireRateLimitResult> {
  const { action, userId, limit, windowSeconds, docClient, tableName } = input;

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const refillPerSecond = limit / windowSeconds;
  const ttl = Math.floor((now + (windowSeconds * 1000 * 2)) / 1000);
  const pk = rateLimitPk(action, userId);
  const base = { mode: 'atomic_table' as const, strategy: 'token_bucket_approx' as const, limit, windowSeconds };

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const items = await readItemsByKeys(docClient, tableName, pk, [TOKEN_BUCKET_SK]);
    const state = items.find((item) => item.sk === TOKEN_BUCKET_SK);

    const tokenBalance = Number(state?.tokenBalance ?? limit);
    const clampedTokenBalance = Number.isFinite(tokenBalance) ? Math.min(limit, Math.max(0, tokenBalance)) : limit;
    const lastRefillAt = state?.lastRefillAt;
    const lastRefillMs = lastRefillAt ? new Date(lastRefillAt).getTime() : now;
    const elapsedSeconds = Math.max(0, Number.isFinite(lastRefillMs) ? (now - lastRefillMs) / 1000 : 0);
    const refilledTokens = Math.min(limit, clampedTokenBalance + (elapsedSeconds * refillPerSecond));

    if (refilledTokens < 1) {
      return { ...base, allowed: false, current: Math.ceil(limit - refilledTokens), weightedCurrent: limit - refilledTokens };
    }

    const nextTokenBalance = refilledTokens - 1;
    try {
      if (!state) {
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { pk, sk: TOKEN_BUCKET_SK },
          UpdateExpression: 'SET tokenBalance = :tokenBalance, lastRefillAt = :lastRefillAt, #ttl = :ttl, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_not_exists(pk)',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':tokenBalance': nextTokenBalance, ':lastRefillAt': nowIso, ':ttl': ttl, ':updatedAt': nowIso },
        }));
      } else {
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { pk, sk: TOKEN_BUCKET_SK },
          UpdateExpression: 'SET tokenBalance = :tokenBalance, lastRefillAt = :lastRefillAt, #ttl = :ttl, updatedAt = :updatedAt',
          ConditionExpression: 'tokenBalance = :expectedTokenBalance AND lastRefillAt = :expectedLastRefillAt',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: {
            ':tokenBalance': nextTokenBalance,
            ':lastRefillAt': nowIso,
            ':ttl': ttl,
            ':updatedAt': nowIso,
            ':expectedTokenBalance': state.tokenBalance,
            ':expectedLastRefillAt': state.lastRefillAt,
          },
        }));
      }

      return { ...base, allowed: true, current: Math.ceil(limit - nextTokenBalance), weightedCurrent: limit - nextTokenBalance };
    } catch (error: any) {
      if (error?.name !== 'ConditionalCheckFailedException') throw error;
      if (attempt === maxAttempts - 1) {
        return { ...base, allowed: false, current: limit, weightedCurrent: limit };
      }
    }
  }

  return { ...base, allowed: false, current: limit, weightedCurrent: limit };
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
      windowSeconds,
    };
  }

  const strategy = resolveRateLimitStrategy();
  const args = { action, userId, limit, windowSeconds, docClient, tableName };
  if (strategy === 'token_bucket_approx') return acquireTokenBucketSlot(args);
  return acquireSlidingWindowSlot(args);
}

/** env 기반 limit 해석 (레거시 resolveRateLimitPerMinute/WindowSeconds 이식) */
export function resolvePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
