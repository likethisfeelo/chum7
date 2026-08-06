import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { AppEnv, docClient, fail, ok, publishEvent, tableName } from '@chum7/api-kit';
import {
  VOUCHER_DEFAULT_EXPIRY_DAYS,
  VoucherItem,
  deleteGiftCatalogItem,
  getGiftCatalogItem,
  getVoucher,
  listGiftCatalog,
  listMyVouchers,
  listVouchersByChallenge,
  putGiftCatalogItem,
  putVoucher,
  transitionVoucher,
  updateVoucherBeforeClaim,
} from '../repo/gifts';

/**
 * 완주 선물 교환권 — /pay/gifts/*  (requireAuth는 index.ts의 /pay/*)
 *  리더: 카탈로그 관리, 완주자에게 발송(개별 즉석 입력 / 카탈로그 선택·일괄), 지급 전 수정,
 *        실물 발송 처리(ship)
 *  유저: 교환권함 조회, 교환 신청(claim — 실물은 이름/전화/주소 입력), 수령 확인
 * 만료: 발행 시 기본 +30일(교환권마다), 지급(claim) 전까지 수정 가능. 만료 판정은 lazy.
 */
export const giftRoutes = new Hono<AppEnv>();

const catalogSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  type: z.enum(['digital', 'physical']),
});

const sendSchema = z.object({
  toUserId: z.string().min(1),
  // 카탈로그 선택 또는 즉석 입력 중 하나
  giftId: z.string().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  type: z.enum(['digital', 'physical']).optional(),
  expiresAt: z.string().datetime().optional(),
});

const sendBatchSchema = z.object({
  giftId: z.string().min(1),
  userIds: z.array(z.string().min(1)).min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

const editVoucherSchema = z.object({
  giftName: z.string().trim().min(1).max(100).optional(),
  giftDescription: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

const claimSchema = z.object({
  // 실물 교환권 수령 정보 — physical claim 시 필수
  name: z.string().trim().min(1).max(50).optional(),
  phone: z.string().trim().min(8).max(20).optional(),
  address: z.string().trim().min(5).max(300).optional(),
});

const shipSchema = z.object({ trackingInfo: z.string().trim().max(200).optional() });

const defaultExpiry = (nowIso: string): string =>
  new Date(new Date(nowIso).getTime() + VOUCHER_DEFAULT_EXPIRY_DAYS * 86_400_000).toISOString();

/** 챌린지 META 읽기 전용 — 소유자·매니저 확인 (routes/tickets.ts 패턴) */
async function getChallengeMeta(challengeId: string) {
  const res = await docClient.send(
    new GetCommand({
      TableName: tableName('CHALLENGES_TABLE'),
      Key: { pk: `CHAL#${challengeId}`, sk: 'META' },
      ProjectionExpression: 'challengeId, title, createdBy, lifecycle, managerIds',
    }),
  );
  return res.Item as
    | { challengeId: string; title?: string; createdBy?: string; lifecycle?: string; managerIds?: string[] }
    | undefined;
}

/** 완주자 목록 — challenges 파티션 UC# 읽기 전용 (status='completed'만) */
async function listCompleters(challengeId: string): Promise<Array<{ userId: string; score?: number }>> {
  const out: Array<{ userId: string; score?: number }> = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(
      new QueryCommand({
        TableName: tableName('CHALLENGES_TABLE'),
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :uc)',
        ExpressionAttributeValues: { ':pk': `CHAL#${challengeId}`, ':uc': 'UC#' },
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of res.Items ?? []) {
      if (item.status === 'completed' && item.userId) {
        out.push({ userId: String(item.userId), score: Number(item.score ?? 0) });
      }
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

/** 만료 lazy 판정 — issued && expiresAt 경과면 expired로 전환해 반환 */
async function withLazyExpiry(voucher: VoucherItem): Promise<VoucherItem> {
  if (voucher.status === 'issued' && voucher.expiresAt && voucher.expiresAt < new Date().toISOString()) {
    await transitionVoucher(voucher.voucherId, 'issued', 'expired', {}).catch(() => undefined);
    return { ...voucher, status: 'expired' };
  }
  return voucher;
}

interface LeaderGuard {
  error?: Response;
  challenge?: NonNullable<Awaited<ReturnType<typeof getChallengeMeta>>>;
}

async function requireChallengeLeader(
  c: any,
  challengeId: string,
  opts?: { leaderOnly?: boolean },
): Promise<LeaderGuard> {
  const challenge = await getChallengeMeta(challengeId);
  if (!challenge) return { error: fail(c, 404, 'CHALLENGE_NOT_FOUND', '챌린지를 찾을 수 없습니다') };
  const { userId } = c.get('authUser')!;
  const managerIds = Array.isArray(challenge.managerIds) ? challenge.managerIds.map(String) : [];
  const isOwner = String(challenge.createdBy ?? '') === userId;
  const isManager = !opts?.leaderOnly && managerIds.includes(userId);
  if (!isOwner && !isManager) {
    return { error: fail(c, 403, 'FORBIDDEN', opts?.leaderOnly ? '챌린지 리더만 사용할 수 있어요' : '챌린지 리더·매니저만 사용할 수 있어요') };
  }
  return { challenge };
}

/** 교환권 1건 발행 (공용) — 완주자 검증은 호출자가 수행 */
async function issueVoucher(params: {
  challengeId: string;
  challengeTitle: string | null;
  leaderId: string;
  userId: string;
  giftName: string;
  giftDescription: string | null;
  type: 'digital' | 'physical';
  expiresAt?: string;
}): Promise<VoucherItem> {
  const nowIso = new Date().toISOString();
  const voucher: VoucherItem = {
    voucherId: randomUUID(),
    challengeId: params.challengeId,
    challengeTitle: params.challengeTitle,
    leaderId: params.leaderId,
    userId: params.userId,
    giftName: params.giftName,
    giftDescription: params.giftDescription,
    type: params.type,
    status: 'issued',
    createdAt: nowIso,
    expiresAt: params.expiresAt ?? defaultExpiry(nowIso),
  };
  await putVoucher(voucher);
  try {
    await publishEvent('gift.issued', {
      voucherId: voucher.voucherId,
      challengeId: params.challengeId,
      userId: params.userId,
      leaderId: params.leaderId,
      giftName: params.giftName,
    });
  } catch (err: any) {
    console.error('gift.issued publish error (non-fatal):', err?.message);
  }
  return voucher;
}

// ── 유저 ──────────────────────────────────────────────────────────────────

// 교환권함 — 받은 교환권 전체 (만료 lazy 반영)
giftRoutes.get('/my', async (c) => {
  const { userId } = c.get('authUser')!;
  const raw = await listMyVouchers(userId);
  const vouchers = await Promise.all(raw.map((v) => withLazyExpiry(v)));
  return ok(c, { vouchers, total: vouchers.length });
});

// 교환 신청 — digital: 사용 완료 / physical: 이름·전화·주소 입력 → 배송 대기
giftRoutes.post('/:voucherId/claim', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = claimSchema.parse(await c.req.json().catch(() => ({})));
  const found = await getVoucher(c.req.param('voucherId'));
  if (!found || found.userId !== userId) {
    return fail(c, 404, 'VOUCHER_NOT_FOUND', '교환권을 찾을 수 없습니다');
  }
  const voucher = await withLazyExpiry(found);
  if (voucher.status === 'expired') return fail(c, 409, 'VOUCHER_EXPIRED', '만료된 교환권이에요');
  if (voucher.status !== 'issued') return fail(c, 409, 'ALREADY_CLAIMED', '이미 교환 신청한 교환권이에요');

  const nowIso = new Date().toISOString();
  let recipient: { name: string; phone: string; address: string } | null = null;
  if (voucher.type === 'physical') {
    if (!input.name || !input.phone || !input.address) {
      return fail(c, 400, 'RECIPIENT_REQUIRED', '실물 교환권은 수령인 이름·전화번호·주소를 입력해야 해요');
    }
    recipient = { name: input.name, phone: input.phone, address: input.address };
  }

  const done = await transitionVoucher(voucher.voucherId, 'issued', 'claimed', {
    claimedAt: nowIso,
    recipient,
  });
  if (!done) return fail(c, 409, 'ALREADY_CLAIMED', '이미 처리된 교환권이에요');

  try {
    await publishEvent('gift.claimed', {
      voucherId: voucher.voucherId,
      challengeId: voucher.challengeId,
      userId,
      leaderId: voucher.leaderId,
      giftName: voucher.giftName,
      isPhysical: voucher.type === 'physical',
    });
  } catch (err: any) {
    console.error('gift.claimed publish error (non-fatal):', err?.message);
  }
  return ok(
    c,
    { voucherId: voucher.voucherId, status: 'claimed' },
    voucher.type === 'physical'
      ? '교환 신청 완료! 리더가 발송하면 알림으로 알려드릴게요 📦'
      : '교환권을 사용했어요 🎁',
  );
});

// 수령 확인 — shipped → delivered
giftRoutes.post('/:voucherId/confirm-receipt', async (c) => {
  const { userId } = c.get('authUser')!;
  const voucher = await getVoucher(c.req.param('voucherId'));
  if (!voucher || voucher.userId !== userId) {
    return fail(c, 404, 'VOUCHER_NOT_FOUND', '교환권을 찾을 수 없습니다');
  }
  const done = await transitionVoucher(voucher.voucherId, 'shipped', 'delivered', {
    deliveredAt: new Date().toISOString(),
  });
  if (!done) return fail(c, 409, 'INVALID_STATE', '발송된 교환권만 수령 확인할 수 있어요');
  return ok(c, { voucherId: voucher.voucherId, status: 'delivered' }, '수령을 확인했어요. 축하해요 🎉');
});

// ── 리더 ──────────────────────────────────────────────────────────────────

// 현황 — 카탈로그 + 완주자 + 발송된 교환권
giftRoutes.get('/leader/:challengeId', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireChallengeLeader(c, challengeId);
  if (guard.error) return guard.error;

  const [catalog, completers, rawVouchers] = await Promise.all([
    listGiftCatalog(challengeId),
    listCompleters(challengeId),
    listVouchersByChallenge(challengeId),
  ]);
  const vouchers = await Promise.all(rawVouchers.map((v) => withLazyExpiry(v)));
  return ok(c, { catalog, completers, vouchers });
});

// 카탈로그 등록 (미리 지정해놓는 선물)
giftRoutes.post('/leader/:challengeId/catalog', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireChallengeLeader(c, challengeId);
  if (guard.error) return guard.error;
  const { userId: leaderId } = c.get('authUser')!;
  const input = catalogSchema.parse(await c.req.json().catch(() => ({})));

  const item = {
    giftId: randomUUID(),
    challengeId,
    leaderId,
    name: input.name,
    description: input.description ?? null,
    type: input.type,
    createdAt: new Date().toISOString(),
  };
  await putGiftCatalogItem(item);
  return ok(c, { gift: item }, '선물을 등록했어요', 201);
});

giftRoutes.delete('/leader/:challengeId/catalog/:giftId', async (c) => {
  const challengeId = c.req.param('challengeId');
  // 삭제 계열은 리더 전용 (매니저 불가)
  const guard = await requireChallengeLeader(c, challengeId, { leaderOnly: true });
  if (guard.error) return guard.error;
  await deleteGiftCatalogItem(challengeId, c.req.param('giftId'));
  return ok(c, { deleted: true }, '선물을 삭제했어요');
});

// 개별 발송 — 완주자 지정 (카탈로그 선택 또는 즉석 입력)
giftRoutes.post('/leader/:challengeId/send', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireChallengeLeader(c, challengeId);
  if (guard.error) return guard.error;
  const challenge = guard.challenge!;
  const { userId: leaderId } = c.get('authUser')!;
  const input = sendSchema.parse(await c.req.json().catch(() => ({})));

  // 선물 내용 결정 — giftId 우선, 없으면 즉석 입력(name+type 필수)
  let giftName: string;
  let giftDescription: string | null;
  let type: 'digital' | 'physical';
  if (input.giftId) {
    const gift = await getGiftCatalogItem(challengeId, input.giftId);
    if (!gift) return fail(c, 404, 'GIFT_NOT_FOUND', '등록된 선물을 찾을 수 없습니다');
    giftName = gift.name;
    giftDescription = gift.description ?? null;
    type = gift.type;
  } else {
    if (!input.name || !input.type) {
      return fail(c, 400, 'GIFT_CONTENT_REQUIRED', '선물 이름과 유형(digital/physical)을 입력해주세요');
    }
    giftName = input.name;
    giftDescription = input.description ?? null;
    type = input.type;
  }

  // 완주자 검증
  const completers = await listCompleters(challengeId);
  if (!completers.some((p) => p.userId === input.toUserId)) {
    return fail(c, 409, 'NOT_A_COMPLETER', '완주한 참여자에게만 선물을 보낼 수 있어요');
  }

  const voucher = await issueVoucher({
    challengeId,
    challengeTitle: challenge.title ?? null,
    leaderId,
    userId: input.toUserId,
    giftName,
    giftDescription,
    type,
    expiresAt: input.expiresAt,
  });
  return ok(c, { voucher }, '선물 교환권을 보냈어요 🎁', 201);
});

// 일괄 발송 — 미리 등록한 선물을 지정 완주자들에게
giftRoutes.post('/leader/:challengeId/send-batch', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireChallengeLeader(c, challengeId);
  if (guard.error) return guard.error;
  const challenge = guard.challenge!;
  const { userId: leaderId } = c.get('authUser')!;
  const input = sendBatchSchema.parse(await c.req.json().catch(() => ({})));

  const gift = await getGiftCatalogItem(challengeId, input.giftId);
  if (!gift) return fail(c, 404, 'GIFT_NOT_FOUND', '등록된 선물을 찾을 수 없습니다');

  const completerSet = new Set((await listCompleters(challengeId)).map((p) => p.userId));
  const targets = [...new Set(input.userIds)].filter((id) => completerSet.has(id));
  const skipped = [...new Set(input.userIds)].filter((id) => !completerSet.has(id));

  const issued: string[] = [];
  for (const toUserId of targets) {
    const voucher = await issueVoucher({
      challengeId,
      challengeTitle: challenge.title ?? null,
      leaderId,
      userId: toUserId,
      giftName: gift.name,
      giftDescription: gift.description ?? null,
      type: gift.type,
      expiresAt: input.expiresAt,
    });
    issued.push(voucher.voucherId);
  }
  return ok(
    c,
    { issuedCount: issued.length, skippedUserIds: skipped },
    `${issued.length}명에게 선물 교환권을 보냈어요 🎁${skipped.length > 0 ? ` (완주자가 아닌 ${skipped.length}명 제외)` : ''}`,
    201,
  );
});

// 지급 전 수정 — 이름/설명/만료일 (status=issued일 때만, 지급 후 잠금)
giftRoutes.patch('/leader/:challengeId/vouchers/:voucherId', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireChallengeLeader(c, challengeId);
  if (guard.error) return guard.error;
  const input = editVoucherSchema.parse(await c.req.json().catch(() => ({})));

  const voucher = await getVoucher(c.req.param('voucherId'));
  if (!voucher || voucher.challengeId !== challengeId) {
    return fail(c, 404, 'VOUCHER_NOT_FOUND', '교환권을 찾을 수 없습니다');
  }
  const done = await updateVoucherBeforeClaim(voucher.voucherId, {
    giftName: input.giftName,
    giftDescription: input.giftDescription,
    expiresAt: input.expiresAt,
  });
  if (!done) return fail(c, 409, 'ALREADY_CLAIMED', '이미 지급(교환 신청)된 교환권은 수정할 수 없어요');
  return ok(c, { voucherId: voucher.voucherId }, '교환권을 수정했어요');
});

// 실물 발송 처리 — claimed → shipped (+운송 정보)
giftRoutes.post('/leader/:challengeId/vouchers/:voucherId/ship', async (c) => {
  const challengeId = c.req.param('challengeId');
  const guard = await requireChallengeLeader(c, challengeId);
  if (guard.error) return guard.error;
  const input = shipSchema.parse(await c.req.json().catch(() => ({})));

  const voucher = await getVoucher(c.req.param('voucherId'));
  if (!voucher || voucher.challengeId !== challengeId) {
    return fail(c, 404, 'VOUCHER_NOT_FOUND', '교환권을 찾을 수 없습니다');
  }
  if (voucher.type !== 'physical') {
    return fail(c, 400, 'NOT_PHYSICAL', '실물 교환권만 발송 처리할 수 있어요');
  }
  const nowIso = new Date().toISOString();
  const done = await transitionVoucher(voucher.voucherId, 'claimed', 'shipped', {
    shippedAt: nowIso,
    trackingInfo: input.trackingInfo ?? null,
  });
  if (!done) return fail(c, 409, 'INVALID_STATE', '교환 신청된 교환권만 발송 처리할 수 있어요');

  try {
    await publishEvent('gift.shipped', {
      voucherId: voucher.voucherId,
      challengeId,
      userId: voucher.userId,
      giftName: voucher.giftName,
      trackingInfo: input.trackingInfo,
    });
  } catch (err: any) {
    console.error('gift.shipped publish error (non-fatal):', err?.message);
  }
  return ok(c, { voucherId: voucher.voucherId, status: 'shipped' }, '발송 처리했어요. 유저에게 알림이 전송됩니다 📦');
});
