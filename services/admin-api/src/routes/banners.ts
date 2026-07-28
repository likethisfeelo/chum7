/**
 * 카테고리 배너 CRUD — 레거시 admin/category-banners/{list,upsert,activate} 이식 + 삭제(신규).
 * 레거시 성공 바디는 비-envelope `{ data: ... }` 플랫 형식 — c.json으로 그대로 유지 (PORTING.md §3).
 * BANNERACTIVE gsi1 sparse 키는 활성화 트랜잭션이 유지 (gamification-api getActiveBanner 계약).
 */
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AppEnv } from '@chum7/api-kit';
import { fail, ok } from '@chum7/api-kit';
import { bannerUpsertSchema, bannerUploadUrlSchema } from '../schemas';
import {
  VALID_BANNER_SLUGS,
  activateBannerTransaction,
  deleteBanner,
  listBanners,
  putBanner,
  bannerPk,
} from '../repo/banners';
import { buildBannerImageKey, presignBannerImagePut, UPLOAD_URL_EXPIRES_SEC } from '../repo/media';
import { recordAudit } from '../repo/audit';
import { stripKeys } from '../repo/shared';

export const bannerRoutes = new Hono<AppEnv>();

const isValidSlug = (slug: string) => (VALID_BANNER_SLUGS as readonly string[]).includes(slug);

// ── 배너 이미지 업로드용 presigned PUT (신규 — 서버 저장 지원) ──
// 정적 경로이므로 POST /:slug 보다 먼저 등록해 param 라우트와의 충돌을 방지한다.
bannerRoutes.post('/upload-url', async (c) => {
  const { userId } = c.get('authUser')!;
  if (!process.env.UPLOADS_BUCKET) {
    return fail(c, 500, 'UPLOADS_BUCKET_NOT_CONFIGURED', '업로드 설정이 올바르지 않습니다');
  }
  const body = await c.req.json().catch(() => ({}));
  const parsed = bannerUploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다', { details: parsed.error.flatten() });
  }

  const key = buildBannerImageKey(parsed.data.contentType);
  const uploadUrl = await presignBannerImagePut(userId, key, parsed.data.contentType);

  const stage = process.env.STAGE || 'dev';
  const cloudfrontDomain = stage === 'prod' ? 'https://www.chum7.com' : 'https://test.chum7.com';

  return ok(c, { uploadUrl, key, fileUrl: `${cloudfrontDomain}/${key}`, expiresIn: UPLOAD_URL_EXPIRES_SEC });
});

// ── 배너 목록 (레거시 GET /admin/category-banners/{slug}) ──
bannerRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!slug) return fail(c, 400, 'MISSING_SLUG', 'slug가 필요합니다');
  const banners = (await listBanners(slug)).map(stripKeys);
  // 레거시 비-envelope 바디 유지: { data: { banners } }
  return c.json({ data: { banners } }, 200);
});

// ── 배너 생성 (레거시 POST /admin/category-banners/{slug}) ──
bannerRoutes.post('/:slug', async (c) => {
  const { userId } = c.get('authUser')!;
  const slug = c.req.param('slug');
  if (!slug || !isValidSlug(slug)) return fail(c, 400, 'INVALID_SLUG', '유효하지 않은 slug입니다');

  const body = await c.req.json().catch(() => ({}));
  const parsed = bannerUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다', { details: parsed.error.flatten() });
  }

  const bannerId = randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const item = {
    slug,
    bannerId,
    imageUrl: parsed.data.imageUrl ?? null,
    tagline: parsed.data.tagline ?? null,
    description: parsed.data.description ?? null,
    isActive: 'false', // 기본 비활성 — activate 엔드포인트로 전환 (레거시 승계)
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await putBanner({ ...item, pk: bannerPk(slug), sk: bannerId });
  await recordAudit({ actorUserId: userId, action: 'banner.create', targetType: 'banner', targetId: `${slug}#${bannerId}`, payload: parsed.data, now });

  // 레거시 비-envelope 바디 유지: 201 { data: item }
  return c.json({ data: item }, 201);
});

// ── 배너 활성화 (레거시 PUT /admin/category-banners/{slug}/{bannerId}/activate) ──
bannerRoutes.put('/:slug/:bannerId/activate', async (c) => {
  const { userId } = c.get('authUser')!;
  const slug = c.req.param('slug');
  const bannerId = c.req.param('bannerId');
  if (!slug || !bannerId) return fail(c, 400, 'MISSING_PARAMS', 'slug와 bannerId가 필요합니다');

  const allBanners = await listBanners(slug);
  const target = allBanners.find((b) => b.bannerId === bannerId);
  if (!target) return fail(c, 404, 'BANNER_NOT_FOUND', '배너를 찾을 수 없습니다');

  const now = new Date();
  await activateBannerTransaction(slug, bannerId, allBanners, now.toISOString());
  await recordAudit({ actorUserId: userId, action: 'banner.activate', targetType: 'banner', targetId: `${slug}#${bannerId}`, now });

  // 레거시 비-envelope 바디 유지: { data: { slug, activeBannerId } }
  return c.json({ data: { slug, activeBannerId: bannerId } }, 200);
});

// ── 배너 삭제 (신규 — CRUD 보완, 레거시에는 없던 표면) ──
bannerRoutes.delete('/:slug/:bannerId', async (c) => {
  const { userId } = c.get('authUser')!;
  const slug = c.req.param('slug');
  const bannerId = c.req.param('bannerId');
  if (!slug || !bannerId) return fail(c, 400, 'MISSING_PARAMS', 'slug와 bannerId가 필요합니다');

  const allBanners = await listBanners(slug);
  const target = allBanners.find((b) => b.bannerId === bannerId);
  if (!target) return fail(c, 404, 'BANNER_NOT_FOUND', '배너를 찾을 수 없습니다');
  if (target.isActive === 'true') {
    return fail(c, 400, 'BANNER_ACTIVE', '활성 배너는 삭제할 수 없습니다. 다른 배너를 먼저 활성화하세요.');
  }

  await deleteBanner(slug, bannerId);
  await recordAudit({ actorUserId: userId, action: 'banner.delete', targetType: 'banner', targetId: `${slug}#${bannerId}`, now: new Date() });
  return ok(c, undefined, '배너가 삭제되었습니다');
});
