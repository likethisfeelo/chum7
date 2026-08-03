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
import { extractImageS3Key, isLikelySignedAssetUrl } from '../domain/media-key';
import { buildChallengeHistoryItem } from '../domain/public-history';
import { getChallengesBatch } from '../repo/challenges';
import { listMyParticipations } from '../repo/participations';
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

// 공개 인증 목록 (레거시 GET /personal-feed/{userId}/verifications — 퍼블릭 전환에 따라 isPublic 만 노출)
publicUserRoutes.get('/:userId/verifications', async (c) => {
  const targetUserId = c.req.param('userId');
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
  const items = await Promise.all(
    page.map(async (v) => ({
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
    })),
  );

  return ok(c, { items, nextToken: toNextToken(cursor) });
});

// 완주 이력 (레거시 GET /personal-feed/{userId}/challenges — 퍼블릭 표면은 완주분만 노출)
publicUserRoutes.get('/:userId/challenge-history', async (c) => {
  const targetUserId = c.req.param('userId');

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

  const challenges = userChallenges
    .map((uc) => buildChallengeHistoryItem(uc, challengeMap.get(uc.challengeId as string)))
    .filter((item) => item.bucketState === 'completed')
    // 레거시 정렬 승계 (완주 우선은 필터로 충족 — 최신 시작순)
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));

  return ok(c, { challenges, total: challenges.length });
});
