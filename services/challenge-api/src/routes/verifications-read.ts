/**
 * 인증 조회/미디어/수정 라우트 — GET /c/verifications, GET /c/verifications/:id,
 * POST /c/verifications/upload-url, PATCH /c/verifications/:id/{visibility,performed-at}
 * 레거시: backend/services/verification/{list,get,upload-url,visibility,performed-at}/index.ts
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import { createDailyAnonymousId } from '@chum7/core';
import { loadAnonSalt } from '../anon-salt';
import { performedAtSchema, uploadUrlSchema, visibilitySchema } from '../schemas';
import { certDateFromIso, DEFAULT_TIMEZONE, calculateEffectiveCurrentDay, isChallengePeriodEnded, resolveDurationDays } from '../domain/day-sync';
import { isValidTrimRange, resolveVerificationType } from '../domain/verification-rules';
import { extractImageS3Key, isLikelySignedAssetUrl } from '../domain/media-key';
import { findMyParticipationByUcId, getParticipation } from '../repo/participations';
import { getChallenge } from '../repo/challenges';
import { effectiveLifecycleOf } from '../domain/challenge-state';
import {
  findMyVerificationById,
  listChallengeVerifications,
  listMyVerifications,
  listPublicVerificationsByDate,
  updateVerificationFields,
} from '../repo/verifications';
import { listQuests } from '../repo/quests';
import { parseNextToken, stripKeys, toNextToken } from '../repo/shared';

export const verificationReadRoutes = new Hono<AppEnv>();

const s3Client = new S3Client({});

type VerificationItem = Record<string, any>;

async function toRenderableMediaUrl(url?: string | null): Promise<string | null> {
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
  } catch (error) {
    console.error('Failed to sign verification media url:', error);
    return raw;
  }
}

function isPublicVerification(v: VerificationItem): boolean {
  const isPublic = v.isPublic === 'true' || v.isPublic === true;
  const isPersonalOnly = v.isPersonalOnly === true;
  return isPublic && !isPersonalOnly;
}

interface ViewerCtx {
  /** 익명 활동명 솔트 (로드 실패 시 null → '익명' 폴백) */
  salt: string | null;
  /** 조회자 userId — 본인 인증 판별(isMine)용 */
  viewerUserId: string;
  /** questId → 퀘스트 제목/설명 (챌린지 스코프 조회에서만 채워짐). 게시물에 퀘스트 제목 노출용. */
  questMap?: Map<string, { title: string | null; description: string | null }>;
}

/** 작성일 기준 일일 활동명 — createdAt 스냅샷으로 결정적 계산(조회일 무관) */
function verificationDisplayName(v: VerificationItem, salt: string | null): string {
  if (!salt || !v.challengeId || !v.userId) return '익명';
  try {
    return createDailyAnonymousId(v.challengeId, v.userId, salt, new Date(v.createdAt));
  } catch {
    return '익명';
  }
}

async function normalizeVerification(v: VerificationItem, ctx: ViewerCtx) {
  // 다중 이미지(슬라이드) — 저장된 imageUrls 우선, 없으면 단일 imageUrl. 각 URL 렌더 가능하게 서명.
  const rawImages: string[] = Array.isArray(v.imageUrls) && v.imageUrls.length
    ? v.imageUrls.filter((u: unknown): u is string => typeof u === 'string' && Boolean(u))
    : (v.imageUrl ? [String(v.imageUrl)] : []);
  const imageUrlsSigned = (await Promise.all(rawImages.map((u) => toRenderableMediaUrl(u)))).filter(
    (u): u is string => Boolean(u),
  );
  const imageUrl = imageUrlsSigned[0] ?? (await toRenderableMediaUrl(v.imageUrl || null));
  const videoUrl = await toRenderableMediaUrl(v.videoUrl || null);

  const linkUrlRaw = typeof v.linkUrl === 'string' ? v.linkUrl.trim() : '';
  const videoUrlRaw = typeof v.videoUrl === 'string' ? v.videoUrl.trim() : '';
  const imageUrlRaw = typeof v.imageUrl === 'string' ? v.imageUrl.trim() : '';

  const verificationType = resolveVerificationType({
    verificationType: v.verificationType,
    imageUrl: imageUrlRaw,
    videoUrl: videoUrlRaw,
    linkUrl: linkUrlRaw,
  });
  const mediaUrl = verificationType === 'video' ? videoUrl || imageUrl : imageUrl;

  return {
    verificationId: v.verificationId,
    // 실 userId·userName 미노출 — 반익명 정책. 작성일 기준 일일 활동명 + 본인 여부만 제공.
    displayName: verificationDisplayName(v, ctx.salt),
    isMine: v.userId === ctx.viewerUserId,
    challengeId: v.challengeId || null,
    userChallengeId: v.userChallengeId || null,
    day: v.day,
    verificationType,
    questType: v.questType || null,
    // 퀘스트 제목/설명 — 게시물에 어떤 퀘스트 인증인지 표시(설명은 프론트 '더보기'). 챌린지 스코프에서만 해석됨.
    questTitle: v.questId && ctx.questMap ? ctx.questMap.get(v.questId)?.title ?? null : null,
    questDescription: v.questId && ctx.questMap ? ctx.questMap.get(v.questId)?.description ?? null : null,
    // 해시태그 — 챌린지 피드 본문 아래 노출
    hashtag: typeof v.hashtag === 'string' && v.hashtag.trim() ? v.hashtag.trim() : null,
    todayNote: v.todayNote,
    imageUrl: verificationType === 'image' ? mediaUrl : null,
    // 슬라이드용 다중 이미지 (image 타입일 때만). 단일도 배열로 제공.
    imageUrls: verificationType === 'image' ? imageUrlsSigned : [],
    videoUrl: verificationType === 'video' ? mediaUrl : null,
    mediaUrl,
    linkUrl: linkUrlRaw || null,
    isAnonymous: Boolean(v.isAnonymous),
    isExtra: Boolean(v.isExtra),
    isPersonalOnly: Boolean(v.isPersonalOnly),
    cheerCount: v.cheerCount || 0,
    createdAt: v.createdAt,
    performedAt: v.performedAt || v.practiceAt || null,
    certDate: v.certDate || v.verificationDate || null,
    scoreEarned: v.scoreEarned ?? v.score ?? 0,
    mediaValidationStatus: v.mediaValidationStatus || null,
    mediaValidationReason: v.mediaValidationReason || null,
    mediaValidatedAt: v.mediaValidatedAt || null,
  };
}

function matchesExtraFilter(v: VerificationItem, isExtra?: string) {
  if (isExtra === 'true' && !v.isExtra) return false;
  if (isExtra === 'false' && v.isExtra) return false;
  return true;
}

// 인증 목록 (레거시 GET /verifications — mine / public 모드. Scan 모드는 풀스캔 금지로 mine 대체)
verificationReadRoutes.get('/', async (c) => {
  const { userId } = c.get('authUser')!;
  const query = c.req.query();
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
  const isPublic = query.isPublic === 'true';
  const isExtra = query.isExtra;
  const challengeIdFilter = query.challengeId || null;

  let startKey: Record<string, any> | undefined;
  try {
    startKey = parseNextToken(query.nextToken);
  } catch {
    return fail(c, 400, 'INVALID_NEXT_TOKEN', 'nextToken 형식이 올바르지 않습니다');
  }

  let items: VerificationItem[] = [];
  let nextToken: string | null = null;

  if (isPublic && challengeIdFilter) {
    // 종료된 챌린지의 피드는 '참여했던 사람 + 생성자/리더'만 볼 수 있다.
    //  (진행/모집 중에는 종전대로 개방 — effectiveLifecycle이 completed/archived일 때만 제한)
    const challenge = await getChallenge(challengeIdFilter);
    const eff = challenge ? effectiveLifecycleOf(challenge, new Date()) : null;
    if (challenge && (eff === 'completed' || eff === 'archived')) {
      const isOwner = challenge.createdBy === userId || challenge.leaderId === userId;
      const joined = isOwner ? true : Boolean(await getParticipation(challengeIdFilter, userId));
      if (!joined) {
        return fail(
          c,
          403,
          'CHALLENGE_ENDED_MEMBERS_ONLY',
          '종료된 챌린지의 피드는 참여했던 분들만 볼 수 있어요',
        );
      }
    }
    // 챌린지 스코프 공개 피드 — 챌린지 파티션(CHAL#) 전체를 드레인해 '기간 전체' 인증을 보여준다.
    //  (날짜 파티션 VFPUB#<date>는 하루치만 담아 당일 게시물만 노출되던 버그 수정)
    //  sk는 시간순이 아니므로 createdAt 기준으로 최신순 재정렬한다.
    let cursor: Record<string, any> | undefined = startKey;
    const merged: VerificationItem[] = [];
    // 안전 상한: 최대 40페이지(page당 200) — 대형 챌린지도 사실상 전량 조회, 무한루프 방지.
    let truncated = false;
    for (let i = 0; i < 40; i += 1) {
      const result = await listChallengeVerifications(challengeIdFilter, 200, cursor);
      for (const v of result.items) {
        if (!isPublicVerification(v)) continue;
        if (!matchesExtraFilter(v, isExtra)) continue;
        merged.push(v);
      }
      cursor = result.lastKey;
      if (!cursor) break;
      if (i === 39) truncated = true;
    }
    if (truncated) {
      console.warn(`challenge feed drain truncated (challengeId=${challengeIdFilter}, drained=${merged.length})`);
    }
    merged.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    // 챌린지 스코프는 기간 전체 노출이 목적이므로 limit로 자르지 않고 전량 반환한다.
    items = merged;
    nextToken = null;
  } else if (isPublic) {
    // 글로벌 공개 피드(마당·오늘) — gsi2 VFPUB#<KST 오늘> Query (레거시 isPublic-createdAt-index 대응)
    const date = query.date || certDateFromIso(new Date().toISOString(), DEFAULT_TIMEZONE);
    let cursor: Record<string, any> | undefined = startKey;
    const merged: VerificationItem[] = [];
    for (let i = 0; i < 5 && merged.length < limit; i += 1) {
      const result = await listPublicVerificationsByDate(date, Math.max(limit * 4, 80), cursor);
      const filtered = result.items.filter((v) => {
        if (!isPublicVerification(v)) return false;
        if (!matchesExtraFilter(v, isExtra)) return false;
        return true;
      });
      merged.push(...filtered);
      cursor = result.lastKey;
      if (!cursor) break;
    }
    items = merged.slice(0, limit);
    nextToken = toNextToken(cursor);
  } else {
    // 내 인증 — gsi1 VFUSER# Query (레거시 mine=true / Scan 모드 통합)
    const result = await listMyVerifications(userId, Math.max(limit * 4, 80), startKey);
    items = result.items.filter((v) => {
      if (!matchesExtraFilter(v, isExtra)) return false;
      if (challengeIdFilter && v.challengeId !== challengeIdFilter) return false;
      return true;
    });
    items = items.slice(0, limit);
    nextToken = toNextToken(result.lastKey);
  }

  let salt: string | null = null;
  try {
    salt = await loadAnonSalt();
  } catch {
    salt = null; // 솔트 미설정 시 '익명' 폴백 (개별 항목 계산에서 처리)
  }

  // 챌린지 스코프 조회면 퀘스트 제목/설명 맵 구성 (게시물에 퀘스트 제목 노출). 조회 실패는 비치명적.
  let questMap: Map<string, { title: string | null; description: string | null }> | undefined;
  if (challengeIdFilter) {
    try {
      const quests = await listQuests(challengeIdFilter);
      questMap = new Map(
        quests.map((q) => [
          q.questId as string,
          {
            title: typeof q.title === 'string' ? q.title : null,
            description: typeof q.description === 'string' ? q.description : null,
          },
        ]),
      );
    } catch (err: any) {
      console.warn('listQuests for feed questMap failed (non-fatal):', err?.message);
    }
  }

  const ctx: ViewerCtx = { salt, viewerUserId: userId, questMap };

  return ok(c, {
    verifications: await Promise.all(items.map((v) => normalizeVerification(v, ctx))),
    count: items.length,
    nextToken,
  });
});

// 업로드 URL 발급 (레거시 POST /verifications/upload-url — S3 presigned PUT)
verificationReadRoutes.post('/upload-url', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = uploadUrlSchema.parse(await c.req.json().catch(() => ({})));

  const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
  const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
  const isVideo = input.fileType.startsWith('video/');
  const maxSizeBytes = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;

  if ((input.mediaKind === 'video' || isVideo) && !isValidTrimRange(input.trimStartSec, input.trimEndSec)) {
    return fail(c, 400, 'INVALID_TRIM_RANGE', 'trimStartSec/trimEndSec 범위가 올바르지 않습니다');
  }
  if (input.fileSize > maxSizeBytes) {
    return c.json({
      error: 'FILE_SIZE_EXCEEDED',
      message: isVideo ? '영상은 500MB 이내만 업로드할 수 있습니다' : '이미지는 10MB 이내만 업로드할 수 있습니다',
      maxSizeBytes,
    }, 400);
  }
  if (!process.env.UPLOADS_BUCKET) {
    return fail(c, 500, 'UPLOADS_BUCKET_NOT_CONFIGURED', '업로드 설정이 올바르지 않습니다');
  }

  // challengeId 해석 (메타데이터 기록용 — 키 경로에는 사용하지 않음)
  let resolvedChallengeId: string | null = input.challengeId?.trim() || null;
  if (!resolvedChallengeId && input.userChallengeId) {
    const uc = await findMyParticipationByUcId(userId, input.userChallengeId);
    resolvedChallengeId = typeof uc?.challengeId === 'string' && uc.challengeId.trim() ? uc.challengeId.trim() : null;
  }

  const fileExtension =
    input.fileType === 'video/quicktime'
      ? 'mov'
      : input.fileType === 'image/jpeg' || input.fileType === 'image/jpg'
        ? 'jpg'
        : input.fileType === 'image/heic-sequence'
          ? 'heic'
          : input.fileType === 'image/heif-sequence'
            ? 'heif'
            : input.fileType.split('/')[1];

  // 신규 키 패턴: uploads/<userId>/<uuid>.<ext> ("uploads/" prefix는 CloudFront /uploads/* 매핑용)
  const key = `uploads/${userId}/${randomUUID()}.${fileExtension}`;

  const command = new PutObjectCommand({
    Bucket: process.env.UPLOADS_BUCKET,
    Key: key,
    ContentType: input.fileType,
    Metadata: {
      uploadedBy: userId,
      challengeId: resolvedChallengeId || input.challengeId || 'unknown-challenge',
      uploadedAt: new Date().toISOString(),
      mediaKind: input.mediaKind || (isVideo ? 'video' : 'image'),
      trimStartSec: input.trimStartSec !== undefined ? String(input.trimStartSec) : '',
      trimEndSec: input.trimEndSec !== undefined ? String(input.trimEndSec) : '',
      videoDurationSec: input.videoDurationSec !== undefined ? String(input.videoDurationSec) : '',
    },
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  const stage = process.env.STAGE || 'dev';
  const cloudfrontDomain = stage === 'prod' ? 'https://www.chum7.com' : 'https://test.chum7.com';
  const fileUrl = `${cloudfrontDomain}/${key}`;

  return ok(c, { uploadUrl, fileUrl, key, expiresIn: 300 });
});

// 인증 단건 조회 (레거시 GET /verifications/{id} — 본인 인증 조회)
verificationReadRoutes.get('/:verificationId', async (c) => {
  const { userId } = c.get('authUser')!;
  const verificationId = c.req.param('verificationId');

  const verification = await findMyVerificationById(userId, verificationId);
  if (!verification) {
    return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');
  }
  return ok(c, stripKeys(verification));
});

// 추가 인증 공개 전환 (레거시 PATCH /verifications/{id}/visibility)
verificationReadRoutes.patch('/:verificationId/visibility', async (c) => {
  const { userId } = c.get('authUser')!;
  const verificationId = c.req.param('verificationId');
  visibilitySchema.parse(await c.req.json().catch(() => ({})));

  const verification = await findMyVerificationById(userId, verificationId);
  if (!verification) {
    return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');
  }
  if (!verification.isExtra) {
    return fail(c, 400, 'EXTRA_ONLY_ALLOWED', '추가 인증만 공개 전환할 수 있습니다');
  }
  if (!verification.userChallengeId) {
    return fail(c, 400, 'MISSING_USER_CHALLENGE', 'userChallengeId가 없어 공개 전환할 수 없습니다');
  }

  const userChallenge = await getParticipation(verification.challengeId, userId);
  if (!userChallenge) {
    return fail(c, 404, 'USER_CHALLENGE_NOT_FOUND', '챌린지 참여정보를 찾을 수 없습니다');
  }

  const durationDays = resolveDurationDays(undefined, userChallenge.progress);
  const effectiveCurrentDay = calculateEffectiveCurrentDay(userChallenge, new Date().toISOString(), durationDays);
  if (isChallengePeriodEnded(effectiveCurrentDay, durationDays, userChallenge.status)) {
    return fail(c, 400, 'CHALLENGE_PERIOD_ENDED', '챌린지 기간 내에만 공개 전환할 수 있습니다');
  }

  const now = new Date().toISOString();
  await updateVerificationFields(
    { pk: verification.pk, sk: verification.sk },
    {
      isPersonalOnly: false,
      isPublic: 'true',
      updatedAt: now,
      // 공개 전환 시 VFPUB 파티션 키 기록 (plaza-converter·world-summary 소비 계약)
      gsi2pk: `VFPUB#${certDateFromIso(verification.createdAt || now, DEFAULT_TIMEZONE)}`,
      gsi2sk: verification.createdAt || now,
    },
  );

  return c.json({ success: true }, 200);
});

// 수행 시간 수정 (레거시 PATCH /verifications/{id}/performed-at)
verificationReadRoutes.patch('/:verificationId/performed-at', async (c) => {
  const { userId } = c.get('authUser')!;
  const verificationId = c.req.param('verificationId');
  const { performedAt } = performedAtSchema.parse(await c.req.json().catch(() => ({})));

  if (new Date(performedAt).getTime() > Date.now()) {
    return fail(c, 400, 'FUTURE_PERFORMED_AT', '수행 시간은 미래로 설정할 수 없습니다');
  }

  const verification = await findMyVerificationById(userId, verificationId);
  if (!verification) {
    return fail(c, 404, 'VERIFICATION_NOT_FOUND', '인증을 찾을 수 없습니다');
  }
  if (!verification.userChallengeId) {
    return fail(c, 400, 'MISSING_USER_CHALLENGE', 'userChallengeId가 없습니다');
  }

  const userChallenge = await getParticipation(verification.challengeId, userId);
  if (!userChallenge) {
    return fail(c, 404, 'USER_CHALLENGE_NOT_FOUND', '챌린지 참여정보를 찾을 수 없습니다');
  }

  const durationDays = resolveDurationDays(undefined, userChallenge.progress);
  const effectiveCurrentDay = calculateEffectiveCurrentDay(userChallenge, new Date().toISOString(), durationDays);
  if (isChallengePeriodEnded(effectiveCurrentDay, durationDays, userChallenge.status)) {
    return fail(c, 400, 'CHALLENGE_PERIOD_ENDED', '챌린지 기간 내에만 수행 시간을 수정할 수 있습니다');
  }

  await updateVerificationFields(
    { pk: verification.pk, sk: verification.sk },
    {
      performedAt,
      practiceAt: performedAt,
      completedAt: performedAt,
      updatedAt: new Date().toISOString(),
    },
  );

  return c.json({ success: true, performedAt }, 200);
});
