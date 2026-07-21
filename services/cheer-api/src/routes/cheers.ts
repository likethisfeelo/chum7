/**
 * 응원 라우트 — 보내기 / 대상 추천 / 내 응원 / 감사 메시지.
 * 레거시: verification-submit createAutoCheer(발송), get-my-cheers, thank-message.
 * 크로스 도메인: challenges 테이블 READ-ONLY (repo/challenges-readonly — PORTING.md §3).
 */
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AppEnv } from '@chum7/api-kit';
import { fail, ok, publishEvent } from '@chum7/api-kit';
import { sendCheerSchema, THANK_MAX_CHEER_IDS, THANK_MAX_MESSAGE_LENGTH } from '../schemas';
import { buildCheerItems, computeCheerSchedule, randomAlias } from '../domain/cheer-create';
import { isDaySuccess, selectCheerTargets } from '../domain/targets';
import { computeCheerStats, toCheerView } from '../domain/cheer-views';
import {
  batchGetCheers, listReceivedCheers, listSentPointers, markCheerRead,
  putCheerWithProjection, setThankMessage,
} from '../repo/cheers';
import { getChallengeMeta, getParticipation, listChallengeParticipations } from '../repo/challenges-readonly';

export const cheerRoutes = new Hono<AppEnv>();

function todayInTimezone(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function parseLimit(raw: string | undefined, fallback = 20): number {
  const trimmed = (raw ?? String(fallback)).trim();
  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : fallback;
}

// ── 응원 대상 추천 (GET /ch/cheers/targets) — 레거시 incompleteMembers 선별 ──
cheerRoutes.get('/targets', async (c) => {
  const { userId } = c.get('authUser')!;
  const challengeId = (c.req.query('challengeId') ?? '').trim();
  if (!challengeId) {
    return fail(c, 400, 'MISSING_CHALLENGE_ID', 'challengeId가 필요합니다');
  }

  const me = await getParticipation(challengeId, userId);
  if (!me || me.status !== 'active') {
    return fail(c, 403, 'NOT_PARTICIPATING', '참여 중인 챌린지에서만 응원 대상을 조회할 수 있습니다');
  }

  const rawDay = c.req.query('day');
  const parsedDay = rawDay != null && /^\d+$/.test(rawDay.trim()) ? Number(rawDay.trim()) : Number.NaN;
  const day = Number.isFinite(parsedDay) && parsedDay >= 1 ? parsedDay : Number(me.currentDay) || 1;

  const participations = await listChallengeParticipations(challengeId);
  const targets = selectCheerTargets(participations, { selfId: userId, day });

  return ok(c, { targets, total: targets.length, day });
});

// ── 내 응원 (GET /ch/cheers/my) — 레거시 get-my-cheers (받은: gsi1 RECV#, 보낸: SENT 프로젝션) ──
cheerRoutes.get('/my', async (c) => {
  const { userId } = c.get('authUser')!;
  const rawType = (c.req.query('type') || 'received').trim().toLowerCase();
  const type = rawType === 'sent' ? 'sent' : 'received';
  const limit = parseLimit(c.req.query('limit'));

  let cheers: Record<string, any>[];
  if (type === 'received') {
    cheers = await listReceivedCheers(userId, limit);

    // 받은 응원 조회 시 unread 읽음 처리 (레거시 동시성 처리 승계)
    const unreadCheers = cheers.filter((cheer) => !cheer.isRead);
    const readAt = new Date().toISOString();
    const readResults = await Promise.allSettled(
      unreadCheers.map((cheer) => markCheerRead(cheer.cheerId, userId, readAt)),
    );
    unreadCheers.forEach((cheer, index) => {
      const result = readResults[index];
      if (!result) return;
      if (result.status === 'fulfilled') {
        cheer.isRead = true;
        cheer.readAt = readAt;
        return;
      }
      const reason = (result as PromiseRejectedResult).reason;
      if (reason?.name === 'ConditionalCheckFailedException') {
        // 동시 요청에서 이미 읽음 처리된 케이스는 성공으로 간주 (레거시 승계)
        cheer.isRead = true;
        cheer.readAt = cheer.readAt ?? readAt;
        return;
      }
      console.warn(JSON.stringify({ level: 'warn', message: 'Failed to mark cheer as read', cheerId: cheer.cheerId }));
    });
  } else {
    const { items: pointers } = await listSentPointers(userId, limit);
    const metas = await batchGetCheers(pointers.map((p) => p.cheerId as string));
    const byId = new Map(metas.map((m) => [m.cheerId, m]));
    cheers = pointers
      .map((p) => byId.get(p.cheerId))
      .filter((m): m is Record<string, any> => !!m);
  }

  return ok(c, { cheers: cheers.map(toCheerView), stats: computeCheerStats(cheers) });
});

// ── 감사 메시지 (POST /ch/cheers/thank) — 레거시 thank-message ──
cheerRoutes.post('/thank', async (c) => {
  const { userId } = c.get('authUser')!;

  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) ?? {};
  } catch {
    return fail(c, 400, 'INVALID_JSON', '요청 본문이 올바르지 않습니다');
  }

  const cheerIds = body.cheerIds;
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!Array.isArray(cheerIds) || cheerIds.length === 0) {
    return fail(c, 400, 'MISSING_CHEER_IDS', 'cheerIds가 필요합니다');
  }
  if (cheerIds.length > THANK_MAX_CHEER_IDS) {
    return fail(c, 400, 'TOO_MANY_CHEER_IDS', `한 번에 최대 ${THANK_MAX_CHEER_IDS}건까지 처리 가능합니다`);
  }
  if (!message) {
    return fail(c, 400, 'MISSING_MESSAGE', '메시지를 입력해주세요');
  }
  if (message.length > THANK_MAX_MESSAGE_LENGTH) {
    return fail(c, 400, 'MESSAGE_TOO_LONG', `메시지는 ${THANK_MAX_MESSAGE_LENGTH}자 이내여야 합니다`);
  }

  const items = await batchGetCheers(cheerIds.filter((id): id is string => typeof id === 'string'));
  const validCheers = items.filter((item) => item.senderId === userId);
  if (validCheers.length === 0) {
    return fail(c, 404, 'NO_VALID_CHEERS', '업데이트할 수 있는 응원이 없습니다');
  }

  const nowISO = new Date().toISOString();
  const results = await Promise.allSettled(
    validCheers.map((cheer) => setThankMessage(cheer.cheerId, userId, message, nowISO)),
  );
  const updatedCount = results.filter((r) => r.status === 'fulfilled').length;
  if (updatedCount === 0) {
    return fail(c, 404, 'NO_VALID_CHEERS', '업데이트할 수 있는 응원이 없습니다');
  }

  return ok(c, { updatedCount }, '감사 메시지를 전달했어요!');
});

// ── 응원 보내기 (POST /ch/cheers) — 즉시/예약 (scheduledTime = 목표 시간 - delta) ──
cheerRoutes.post('/', async (c) => {
  const { userId } = c.get('authUser')!;

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return fail(c, 400, 'INVALID_JSON_BODY', '요청 본문 JSON 형식이 올바르지 않습니다');
  }
  const input = sendCheerSchema.parse(raw);

  if (input.receiverId === userId) {
    return fail(c, 400, 'CANNOT_CHEER_SELF', '자기 자신에게는 응원을 보낼 수 없습니다');
  }

  const me = await getParticipation(input.challengeId, userId);
  if (!me || me.status !== 'active') {
    return fail(c, 403, 'NOT_PARTICIPATING', '참여 중인 챌린지에서만 응원을 보낼 수 있습니다');
  }

  const receiver = await getParticipation(input.challengeId, input.receiverId);
  if (!receiver || receiver.status !== 'active') {
    return fail(c, 404, 'RECEIVER_NOT_PARTICIPATING', '응원 대상이 챌린지에 참여하고 있지 않습니다');
  }

  if (isDaySuccess(receiver.progress, input.day)) {
    return fail(c, 409, 'RECEIVER_ALREADY_COMPLETED', '이미 오늘 인증을 완료한 참여자예요');
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // 목표 시간: 수신자 personalTarget → 챌린지 targetTime 폴백 (레거시 memberTarget24 승계)
  const challenge = await getChallengeMeta(input.challengeId);
  const memberTarget24: string | null = receiver.personalTarget?.time24 || challenge?.targetTime || null;
  // 타임존 정책 승계 (이전 가이드 §6): 수신자 personalTarget.timezone → x-user-timezone 헤더 → Asia/Seoul
  const timezone: string = receiver.personalTarget?.timezone || c.req.header('x-user-timezone') || 'Asia/Seoul';
  const verificationDate = input.verificationDate ?? todayInTimezone(now, timezone);

  const schedule = computeCheerSchedule({ memberTarget24, verificationDate, timezone, delta: input.delta, nowIso });

  const cheerId = randomUUID();
  const senderAlias = randomAlias();
  const { meta, sentProjection } = buildCheerItems({
    cheerId,
    senderId: userId,
    receiverId: input.receiverId,
    challengeId: input.challengeId,
    verificationId: input.verificationId,
    day: input.day,
    message: input.message,
    delta: input.delta,
    senderAlias,
    schedule,
    nowIso,
  });

  await putCheerWithProjection(meta, sentProjection);

  // 즉시 발송분은 레거시 SNS push 대신 이벤트 발행 (notification-worker가 소비)
  if (schedule.isImmediate) {
    await publishEvent('cheer.delivered', {
      cheerId,
      senderId: userId,
      receiverId: input.receiverId,
      challengeId: input.challengeId,
      day: input.day,
    });
  }

  return ok(
    c,
    {
      cheerId,
      cheerType: meta.cheerType,
      day: input.day,
      scheduledTime: schedule.scheduledTime,
      status: meta.status,
      senderAlias,
    },
    '응원을 보냈어요!',
    201,
  );
});
