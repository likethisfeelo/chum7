/**
 * 리액션/답장 라우트 — 레거시 backend/services/cheer/{react,reply} 이식.
 * 레이트리밋은 항상 cheer 테이블 카운터 아이템 사용 (레거시 scan 폴백 결함 제거 — PORTING.md §4).
 * 429 바디의 limit/current/windowSeconds는 envelope 규칙에 따라 data로 이동.
 */
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { docClient, fail, ok, tableName } from '@chum7/api-kit';
import { ALLOWED_REACTIONS, REPLY_MAX_MESSAGE_LENGTH, UUID_V4_REGEX, type ReactionType } from '../schemas';
import { acquireRateLimitSlot, resolvePositiveInt, type AcquireRateLimitResult } from '../domain/rate-limit';
import { getCheer, setReaction, setReply } from '../repo/cheers';
import { TABLE } from '../repo/shared';

export const reactionRoutes = new Hono<AppEnv>();

const DEFAULT_REACTION_RATE_LIMIT_PER_MINUTE = 20;
const DEFAULT_REACTION_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_REPLY_RATE_LIMIT_PER_MINUTE = 10;
const DEFAULT_REPLY_RATE_LIMIT_WINDOW_SECONDS = 60;

async function checkRateLimit(action: 'reaction' | 'reply', userId: string): Promise<AcquireRateLimitResult> {
  const limit = action === 'reaction'
    ? resolvePositiveInt(process.env.CHEER_REACTION_RATE_LIMIT_PER_MINUTE, DEFAULT_REACTION_RATE_LIMIT_PER_MINUTE)
    : resolvePositiveInt(process.env.CHEER_REPLY_RATE_LIMIT_PER_MINUTE, DEFAULT_REPLY_RATE_LIMIT_PER_MINUTE);
  const windowSeconds = action === 'reaction'
    ? resolvePositiveInt(process.env.CHEER_REACTION_RATE_LIMIT_WINDOW_SECONDS, DEFAULT_REACTION_RATE_LIMIT_WINDOW_SECONDS)
    : resolvePositiveInt(process.env.CHEER_REPLY_RATE_LIMIT_WINDOW_SECONDS, DEFAULT_REPLY_RATE_LIMIT_WINDOW_SECONDS);

  // 항상 cheer 테이블 카운터 (레거시 env 조건부 스캔 폴백 제거)
  return acquireRateLimitSlot({ action, userId, limit, windowSeconds, docClient, tableName: tableName(TABLE) });
}

function validateCheerId(cheerId: string | undefined):
  | { ok: true; cheerId: string }
  | { ok: false; status: number; error: string; message: string } {
  const trimmed = cheerId?.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: 'MISSING_CHEER_ID', message: '응원 ID가 필요합니다' };
  }
  if (!UUID_V4_REGEX.test(trimmed)) {
    return { ok: false, status: 400, error: 'INVALID_CHEER_ID_FORMAT', message: '응원 ID 형식이 올바르지 않습니다' };
  }
  return { ok: true, cheerId: trimmed };
}

// ── 리액션 (POST /ch/cheers/:cheerId/reaction) ──
reactionRoutes.post('/:cheerId/reaction', async (c) => {
  const { userId } = c.get('authUser')!;

  const idCheck = validateCheerId(c.req.param('cheerId'));
  if (!idCheck.ok) return fail(c, idCheck.status, idCheck.error, idCheck.message);
  const { cheerId } = idCheck;

  let reactionType: ReactionType | undefined;
  try {
    const body = ((await c.req.json()) ?? {}) as { reactionType?: unknown };
    reactionType = typeof body.reactionType === 'string' && (ALLOWED_REACTIONS as readonly string[]).includes(body.reactionType)
      ? (body.reactionType as ReactionType)
      : undefined;
  } catch {
    return fail(c, 400, 'INVALID_JSON_BODY', '요청 본문 JSON 형식이 올바르지 않습니다');
  }
  if (!reactionType) {
    return fail(c, 400, 'INVALID_REACTION_TYPE', `reactionType은 ${ALLOWED_REACTIONS.join(', ')} 중 하나여야 합니다`);
  }

  const rateLimit = await checkRateLimit('reaction', userId);
  if (!rateLimit.allowed) {
    console.warn(JSON.stringify({ level: 'warn', message: 'REACTION_RATE_LIMIT_EXCEEDED', userId, ...rateLimit }));
    return fail(c, 429, 'REACTION_RATE_LIMIT_EXCEEDED', '짧은 시간 내 리액션 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요', {
      data: { limit: rateLimit.limit, current: rateLimit.current, windowSeconds: rateLimit.windowSeconds },
    });
  }

  const cheer = await getCheer(cheerId);
  if (!cheer) return fail(c, 404, 'CHEER_NOT_FOUND', '응원을 찾을 수 없습니다');
  if (cheer.receiverId !== userId) {
    return fail(c, 403, 'FORBIDDEN', '본인이 받은 응원에만 리액션할 수 있습니다');
  }
  if (cheer.reactionType) return fail(c, 409, 'ALREADY_REACTED', '이미 리액션을 보냈습니다');

  const now = new Date().toISOString();
  try {
    await setReaction(cheerId, userId, reactionType, now);
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return fail(c, 409, 'ALREADY_REACTED', '이미 리액션을 보냈습니다');
    }
    throw error;
  }

  // 발신자 리액션 알림: 레거시 SNS push — contracts에 이벤트 타입 부재로 미발행 (PORTING.md §4 gap)
  return ok(c, { cheerId, reactionType, reactedAt: now }, '리액션을 보냈습니다');
});

// ── 답장 (POST /ch/cheers/:cheerId/reply) ──
reactionRoutes.post('/:cheerId/reply', async (c) => {
  const { userId } = c.get('authUser')!;

  const idCheck = validateCheerId(c.req.param('cheerId'));
  if (!idCheck.ok) return fail(c, idCheck.status, idCheck.error, idCheck.message);
  const { cheerId } = idCheck;

  let message = '';
  try {
    const body = ((await c.req.json()) ?? {}) as { message?: unknown };
    message = typeof body.message === 'string' ? body.message.trim() : '';
  } catch {
    return fail(c, 400, 'INVALID_JSON_BODY', '요청 본문 JSON 형식이 올바르지 않습니다');
  }
  if (!message || message.length > REPLY_MAX_MESSAGE_LENGTH) {
    return fail(c, 400, 'INVALID_REPLY_MESSAGE', `답장은 1~${REPLY_MAX_MESSAGE_LENGTH}자 문자열이어야 합니다`);
  }

  const rateLimit = await checkRateLimit('reply', userId);
  if (!rateLimit.allowed) {
    console.warn(JSON.stringify({ level: 'warn', message: 'REPLY_RATE_LIMIT_EXCEEDED', userId, ...rateLimit }));
    return fail(c, 429, 'REPLY_RATE_LIMIT_EXCEEDED', '짧은 시간 내 답장 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요', {
      data: { limit: rateLimit.limit, current: rateLimit.current, windowSeconds: rateLimit.windowSeconds },
    });
  }

  const cheer = await getCheer(cheerId);
  if (!cheer) return fail(c, 404, 'CHEER_NOT_FOUND', '응원을 찾을 수 없습니다');
  if (cheer.receiverId !== userId) {
    return fail(c, 403, 'FORBIDDEN', '본인이 받은 응원에만 답장할 수 있습니다');
  }
  if (cheer.replyMessage) return fail(c, 409, 'ALREADY_REPLIED', '이미 답장을 보냈습니다');

  const now = new Date().toISOString();
  try {
    await setReply(cheerId, userId, message, now);
  } catch (error: any) {
    if (error?.name === 'ConditionalCheckFailedException') {
      return fail(c, 409, 'ALREADY_REPLIED', '이미 답장을 보냈습니다');
    }
    throw error;
  }

  // 발신자 답장 알림: 레거시 SNS push — contracts에 이벤트 타입 부재로 미발행 (PORTING.md §4 gap)
  return ok(c, { cheerId, replyMessage: message, repliedAt: now }, '답장을 보냈습니다');
});
