/**
 * 마당(plaza) 운영자 게시 라우트 — ADMIN 콘솔에서 마당 피드에 직접 게시.
 * 마운트: /s/plaza-admin/* (index.ts 에서 requireAuth 적용 후 여기서 그룹 게이트).
 * 권한: requireGroup('admins','operators'). 게시물은 courtyard 카드로 노출되며 isOfficial 배지가 붙는다.
 * 저장/피드 로직은 사용자 작성 경로(routes/plaza.ts POST /posts)와 동일한 repo/domain 유틸을 재사용한다.
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail, requireGroup } from '@chum7/api-kit';
import { createAdminPlazaPostSchema, plazaAdminUploadUrlSchema } from '../schemas';
import { resolvePrimaryHashtag } from '../domain/hashtags';
import { sanitizePost, toCreatorAnimalIcon } from '../domain/plaza-view';
import { buildPostKeys, getPost, putPost, setPostActive } from '../repo/plaza';
import { registerHashtag } from '../repo/hashtags';
import {
  buildPlazaImageKey,
  presignPlazaImagePut,
  toSignedImageUrl,
  PLAZA_UPLOAD_URL_EXPIRES_SEC,
} from '../repo/media';
import { stripKeys } from '../repo/shared';

export const plazaAdminRoutes = new Hono<AppEnv>();

// 운영/관리자만 마당에 직접 게시할 수 있다.
plazaAdminRoutes.use('*', requireGroup('admins', 'operators'));

async function toPublicPost(item: Record<string, any>): Promise<Record<string, any>> {
  const sanitized = sanitizePost(stripKeys(item));
  sanitized.imageUrl = await toSignedImageUrl(sanitized.imageUrl || null);
  if (Array.isArray(sanitized.imageUrls) && sanitized.imageUrls.length) {
    sanitized.imageUrls = (
      await Promise.all(
        sanitized.imageUrls.map((u: unknown) => toSignedImageUrl(typeof u === 'string' ? u : null)),
      )
    ).filter((u): u is string => Boolean(u));
  } else {
    sanitized.imageUrls = sanitized.imageUrl ? [sanitized.imageUrl] : [];
  }
  return sanitized;
}

// 이미지 presigned PUT — uploads/plaza/<uuid>.<ext>
plazaAdminRoutes.post('/upload-url', async (c) => {
  const { userId } = c.get('authUser')!;
  if (!process.env.UPLOADS_BUCKET) {
    return fail(c, 500, 'UPLOADS_BUCKET_NOT_CONFIGURED', '업로드 설정이 올바르지 않습니다');
  }
  const parsed = plazaAdminUploadUrlSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다', {
      details: parsed.error.flatten(),
    });
  }
  const key = buildPlazaImageKey(parsed.data.contentType);
  const uploadUrl = await presignPlazaImagePut(userId, key, parsed.data.contentType);
  const stage = process.env.STAGE || 'dev';
  const cloudfrontDomain = stage === 'prod' ? 'https://www.chum7.com' : 'https://test.chum7.com';
  return ok(c, {
    uploadUrl,
    key,
    fileUrl: `${cloudfrontDomain}/${key}`,
    expiresIn: PLAZA_UPLOAD_URL_EXPIRES_SEC,
  });
});

// 게시물 작성 — courtyard 타입으로 저장해 기본 피드(all)·해당 카테고리 탭에 노출
plazaAdminRoutes.post('/posts', async (c) => {
  const { userId } = c.get('authUser')!;
  const parsed = createAdminPlazaPostSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다', {
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;
  const nowIso = new Date().toISOString();
  const plazaPostId = `courtyard-${randomUUID()}`;

  const { primary, all } = resolvePrimaryHashtag(input.hashtag ?? null, input.content);
  const imageUrls =
    Array.isArray(input.imageUrls) && input.imageUrls.length
      ? input.imageUrls
      : input.imageUrl
        ? [input.imageUrl]
        : [];

  const post: Record<string, any> = {
    ...buildPostKeys({ plazaPostId, postType: 'courtyard', createdAt: nowIso, hashtag: primary }),
    plazaPostId,
    postType: 'courtyard',
    content: input.content,
    imageUrl: input.imageUrl ?? imageUrls[0] ?? null,
    imageUrls,
    challengeTitle: input.title ?? null,
    challengeCategory: input.challengeCategory ?? null,
    currentDay: null,
    leaderId: null,
    leaderName: null,
    leaderMessage: null,
    recruitmentData: null,
    sourceType: 'admin',
    sourceId: null,
    sourceChallengeId: undefined,
    sourceLeaderId: undefined,
    sourceUserId: userId,
    authorId: userId, // 책임추적용 — 퍼블릭 응답에선 sanitizePost 가 제거
    isOfficial: true, // 퍼블릭 응답까지 전달 → 프론트 '운영자' 배지
    officialLabel: '운영자',
    likeCount: 0,
    commentCount: 0,
    bookmarkCount: 0,
    isActive: true,
    createdAt: nowIso,
    ...(primary ? { hashtag: primary } : {}),
  };

  await putPost(post);

  // 해시태그 레지스트리 유지 (사용자 작성 경로와 동일 정책)
  for (const tag of all) {
    await registerHashtag({
      hashtag: tag,
      creatorUserId: userId,
      creatorAnimalIcon: toCreatorAnimalIcon(userId),
      now: nowIso,
    });
  }

  return ok(c, await toPublicPost(post), '마당에 게시되었습니다', 201);
});

// 게시물 내리기 — isActive=false (피드/상세에서 제외)
plazaAdminRoutes.patch('/posts/:plazaPostId/deactivate', async (c) => {
  const plazaPostId = c.req.param('plazaPostId');
  const existing = await getPost(plazaPostId);
  if (!existing) return fail(c, 404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다');
  await setPostActive(plazaPostId, false);
  return ok(c, { plazaPostId, isActive: false }, '게시물을 내렸습니다');
});
