import { Hono } from 'hono';
import { AppEnv, ok } from '@chum7/api-kit';
import { getActiveBanner } from '../repo/banners';

export const bannersRoutes = new Hono<AppEnv>();

/** 카테고리 slug 목록·순서 — 'all'(전체) 포함 (모집중 탐색 첫 페이지 배너) */
const CATEGORY_SLUGS = [
  'all',
  'selflove', 'attitude', 'discipline', 'explore',
  'create', 'build', 'expand', 'impact',
] as const;

interface BannerView {
  slug: string;
  bannerId: string | null;
  imageUrl: string | null;
  tagline: string | null;
  description: string | null;
}

// GET /public/banners  (레거시 GET /category-banners — 활성 배너 목록, 없으면 null 필드)
// 선택 파라미터 ?slug=<category>: 해당 카테고리만 반환 (미지정 시 레거시처럼 전체)
bannersRoutes.get('/', async (c) => {
  const slugFilter = c.req.query('slug');
  const slugs = slugFilter
    ? CATEGORY_SLUGS.filter((s) => s === slugFilter)
    : [...CATEGORY_SLUGS];

  const views = await Promise.all(
    slugs.map(async (slug): Promise<BannerView> => {
      const item = await getActiveBanner(slug);
      return item
        ? {
            slug,
            bannerId: item.bannerId,
            imageUrl: item.imageUrl ?? null,
            tagline: item.tagline ?? null,
            description: item.description ?? null,
          }
        : { slug, bannerId: null, imageUrl: null, tagline: null, description: null };
    }),
  );

  return ok(c, views);
});
