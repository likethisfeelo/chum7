/**
 * 퍼블릭 사용자 프로필 표면 — GET /public/users/:userId/verifications (공개 인증만),
 * GET /public/users/:userId/challenge-history (완주 이력)
 * 레거시: backend/services/personal-feed/{verifications,challenges}/index.ts
 * (응답 필드명 승계 — user-api PORTING.md 미이식 항목의 challenge-api 측 복원).
 */
import { Hono } from 'hono';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import {
  calculateEffectiveCurrentDay,
  isCompletedProgressStatus,
  resolveDurationDays,
} from '../domain/day-sync';
import { normalizeProgress } from '../domain/progress';
import { resolveNormalizedChallengeState } from '../domain/challenge-state';
import { extractImageS3Key, isLikelySignedAssetUrl } from '../domain/media-key';
import { buildChallengeHistoryItem } from '../domain/public-history';
import { getChallengesBatch, listByCreator } from '../repo/challenges';
import { listMyParticipations } from '../repo/participations';
import { getPublicProfileMeta, resolveUserParam } from '../repo/users-readonly';
import { listMyVerifications } from '../repo/verifications';
import { parseNextToken, toNextToken } from '../repo/shared';

export const publicUserRoutes = new Hono<AppEnv>();

const s3Client = new S3Client({});
const DEFAULT_LIMIT = 20;

/** 레거시 signMediaUrl 승계 (personal-feed/verifications) — media-key 단일 진입점 */
async function signMediaUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  if (isLikelySignedAssetUrl(raw)) return raw;

  const key = extractImageS3Key(raw);
  if (!key || !process.env.UPLOADS_BUCKET) return raw;

  const s3Key = key.startsWith('uploads/') ? key : `uploads/${key}`;
  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: process.env.UPLOADS_BUCKET, Key: s3Key }),
      { expiresIn: 3600 },
    );
  } catch {
    return raw;
  }
}

function isPublicVerification(v: Record<string, any>): boolean {
  const isPublic = v.isPublic === 'true' || v.isPublic === true;
  // 관리자 숨김은 타인 프로필 조회에서도 제외 (본인 me/profile-feed 는 무필터라 유지)
  return isPublic && v.isPersonalOnly !== true && v.hiddenByAdmin !== true;
}

/** 공개 인증 1건 → 응답 아이템 (verifications·featured 공용) */
async function toPublicVerificationItem(v: Record<string, any>) {
  return {
    verificationId: v.verificationId as string,
    challengeId: (v.challengeId as string) ?? null,
    challengeTitle: (v.challengeTitle as string) ?? null,
    challengeCategory: (v.challengeCategory as string) ?? null,
    day: typeof v.day === 'number' ? v.day : null,
    score: typeof v.score === 'number' ? v.score : 0,
    verificationType: (v.verificationType as string) ?? 'text',
    imageUrl: await signMediaUrl(v.imageUrl as string | null),
    todayNote: (v.todayNote as string) ?? null,
    createdAt: (v.createdAt as string) ?? null,
  };
}

// 공개 인증 목록 (레거시 GET /personal-feed/{userId}/verifications — 퍼블릭 전환에 따라 isPublic 만 노출)
// :userId 는 원본 userId 또는 @handle (핸들 공유 링크·공개 프로필 페이지 대응)
publicUserRoutes.get('/:userId/verifications', async (c) => {
  const targetUserId = await resolveUserParam(c.req.param('userId'));
  if (!targetUserId) return fail(c, 404, 'HANDLE_NOT_FOUND', '사용자를 찾을 수 없습니다');
  const limit = Math.min(Math.max(Number(c.req.query('limit') || DEFAULT_LIMIT), 1), 50);

  let startKey: Record<string, any> | undefined;
  try {
    startKey = parseNextToken(c.req.query('nextToken'));
  } catch {
    return fail(c, 400, 'INVALID_NEXT_TOKEN', '잘못된 페이지 토큰입니다');
  }

  // gsi1 VFUSER#<userId> Query 최신순 + isPublic 필터 (비공개 인증은 퍼블릭 표면에서 제외)
  let cursor: Record<string, any> | undefined = startKey;
  const merged: Record<string, any>[] = [];
  for (let i = 0; i < 5 && merged.length < limit; i += 1) {
    const result = await listMyVerifications(targetUserId, Math.max(limit * 4, 80), cursor);
    merged.push(...result.items.filter(isPublicVerification));
    cursor = result.lastKey;
    if (!cursor) break;
  }

  const page = merged.slice(0, limit);
  const items = await Promise.all(page.map(toPublicVerificationItem));

  return ok(c, { items, nextToken: toNextToken(cursor) });
});

// 완주 이력 (레거시 GET /personal-feed/{userId}/challenges — 퍼블릭 표면은 완주분만 노출)
publicUserRoutes.get('/:userId/challenge-history', async (c) => {
  const targetUserId = await resolveUserParam(c.req.param('userId'));
  if (!targetUserId) return fail(c, 404, 'HANDLE_NOT_FOUND', '사용자를 찾을 수 없습니다');

  const userChallenges = await listMyParticipations(targetUserId);
  if (userChallenges.length === 0) {
    return ok(c, { challenges: [], total: 0 });
  }

  const challengeIds = [
    ...new Set(userChallenges.map((uc) => uc.challengeId as string).filter(Boolean)),
  ];
  const challengeMap = new Map(
    (await getChallengesBatch(challengeIds)).map((ch) => [ch.challengeId as string, ch]),
  );

  // 저장 status는 워커 지연으로 미확정일 수 있어 읽기 시점에 정규화한다
  // (my-challenges와 동일 — 완주했는데 status가 안 바뀐 참여가 이력에서 빠지던 문제)
  const nowIso = new Date().toISOString();
  const challenges = userChallenges
    .map((uc) => {
      const challenge = challengeMap.get(uc.challengeId as string) as Record<string, any> | undefined;
      const durationDays = resolveDurationDays(challenge?.durationDays, uc.progress);
      const completedDays = normalizeProgress(uc.progress).filter((p) =>
        isCompletedProgressStatus(p?.status),
      ).length;
      const effectiveCurrentDay = calculateEffectiveCurrentDay(
        { ...uc, challengeStartAt: challenge?.challengeStartAt },
        nowIso,
        durationDays,
      );
      const normalized = resolveNormalizedChallengeState({
        status: uc.status,
        phase: uc.phase,
        challengeLifecycle: challenge?.lifecycle,
        effectiveCurrentDay,
        durationDays,
        completedDays,
      });
      return buildChallengeHistoryItem(
        { ...uc, status: normalized.status, phase: normalized.phase },
        challenge,
      );
    })
    .filter((item) => item.bucketState === 'completed')
    // 레거시 정렬 승계 (완주 우선은 필터로 충족 — 최신 시작순)
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));

  return ok(c, { challenges, total: challenges.length });
});

// ── 공개 프로필 표면 (핸들 래핑 정책 — /p/@handle 페이지) ────────────────

/** 챌린지 META → 공개 카드 필드 (내부 키·민감 필드 제외) */
function toPublicChallengeCard(ch: Record<string, any>, role: 'leader' | 'manager') {
  return {
    role,
    challengeId: ch.challengeId as string,
    title: (ch.title as string) ?? '',
    description: (ch.description as string) ?? '',
    category: (ch.category as string) ?? null,
    badgeIcon: (ch.badgeIcon as string) ?? null,
    badgeName: (ch.badgeName as string) ?? null,
    lifecycle: (ch.lifecycle as string) ?? null,
    disbanded: ch.disbanded === true,
    durationDays: typeof ch.durationDays === 'number' ? ch.durationDays : null,
    challengeStartAt: (ch.challengeStartAt as string) ?? null,
    stats: ch.stats ?? null,
    rewardProducts: Array.isArray(ch.rewardProducts) ? ch.rewardProducts : null,
  };
}

/**
 * 리더/매니저로 연 챌린지 목록 — 공개 프로필의 "여는 챌린지" 섹션.
 *  리더 = 챌린지 생성자(gsi2 CREATOR#), 매니저 = 참여 챌린지 중 managerIds 포함.
 *  버킷: recruiting(모집중) / active(진행중) / past(진행했던 — completed·archived·해산).
 */
publicUserRoutes.get('/:userId/led-challenges', async (c) => {
  const targetUserId = await resolveUserParam(c.req.param('userId'));
  if (!targetUserId) return fail(c, 404, 'HANDLE_NOT_FOUND', '사용자를 찾을 수 없습니다');

  const [created, participations] = await Promise.all([
    listByCreator(targetUserId),
    listMyParticipations(targetUserId),
  ]);

  // 매니저 챌린지 — 참여 레코드에서 후보를 모아 META의 managerIds로 판정
  const createdIds = new Set(created.map((ch) => String(ch.challengeId)));
  const candidateIds = [
    ...new Set(
      participations
        .map((uc) => String(uc.challengeId ?? ''))
        .filter((id) => id && !createdIds.has(id)),
    ),
  ];
  const candidates = candidateIds.length > 0 ? await getChallengesBatch(candidateIds) : [];
  const managed = candidates.filter(
    (ch) => Array.isArray(ch.managerIds) && ch.managerIds.includes(targetUserId),
  );

  const cards = [
    ...created.map((ch) => toPublicChallengeCard(ch, 'leader')),
    ...managed.map((ch) => toPublicChallengeCard(ch, 'manager')),
  ];

  const recruiting = cards.filter((ch) => ch.lifecycle === 'recruiting' && !ch.disbanded);
  const active = cards.filter((ch) => ch.lifecycle === 'active' && !ch.disbanded);
  const past = cards.filter(
    (ch) => ch.disbanded || ch.lifecycle === 'completed' || ch.lifecycle === 'archived',
  );
  const byStartDesc = (a: { challengeStartAt: string | null }, b: { challengeStartAt: string | null }) =>
    (b.challengeStartAt ?? '').localeCompare(a.challengeStartAt ?? '');
  recruiting.sort(byStartDesc);
  active.sort(byStartDesc);
  past.sort(byStartDesc);

  return ok(c, { recruiting, active, past, total: cards.length });
});

/**
 * 대표 게시물 — 본인이 프로필 피드에서 고른 최대 6개(publicProfile.featuredIds).
 *  읽기 시점에 공개 인증 필터(isPublicVerification)를 적용해 반려·숨김·비공개 전환분을 걸러낸다.
 */
publicUserRoutes.get('/:userId/featured', async (c) => {
  const targetUserId = await resolveUserParam(c.req.param('userId'));
  if (!targetUserId) return fail(c, 404, 'HANDLE_NOT_FOUND', '사용자를 찾을 수 없습니다');

  const meta = await getPublicProfileMeta(targetUserId);
  const publicProfile = (meta?.publicProfile ?? null) as Record<string, any> | null;
  const featuredIds: string[] = Array.isArray(publicProfile?.featuredIds)
    ? publicProfile!.featuredIds.map(String).slice(0, 6)
    : [];
  if (publicProfile?.enabled !== true || featuredIds.length === 0) {
    return ok(c, { items: [] });
  }

  // 본인 인증 파티션(gsi1 VFUSER#)을 드레인하며 지정 id + 공개분만 수집
  const wanted = new Set(featuredIds);
  const found: Record<string, any>[] = [];
  let cursor: Record<string, any> | undefined;
  for (let i = 0; i < 8 && found.length < wanted.size; i += 1) {
    const result = await listMyVerifications(targetUserId, 100, cursor);
    for (const v of result.items) {
      if (wanted.has(String(v.verificationId)) && isPublicVerification(v)) found.push(v);
    }
    cursor = result.lastKey;
    if (!cursor) break;
  }

  // 본인이 고른 순서 유지
  const order = new Map(featuredIds.map((id, idx) => [id, idx]));
  found.sort(
    (a, b) => (order.get(String(a.verificationId)) ?? 99) - (order.get(String(b.verificationId)) ?? 99),
  );
  const items = await Promise.all(found.map(toPublicVerificationItem));
  return ok(c, { items });
});
