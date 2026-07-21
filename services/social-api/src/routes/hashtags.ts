/**
 * 해시태그 라우트.
 * 퍼블릭: GET /public/hashtags, GET /public/hashtags/:tag, GET /public/hashtags/:tag/posts
 * 보호:   GET /s/hashtags/:tag/follow/status, POST·DELETE /s/hashtags/:tag/follow
 * 레거시: backend/services/plaza/hashtag (hashtag-stack — 전 라우트 보호였으나 조회는 /public 이동)
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail } from '@chum7/api-kit';
import {
  countFollowers,
  deleteFollow,
  getFollow,
  getHashtag,
  listLatestHashtags,
  listTagPosts,
  putFollow,
} from '../repo/hashtags';
import { toSignedImageUrl } from '../repo/media';

function decodeCursor(raw?: string): Record<string, any> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return undefined; // 레거시: 손상 커서는 무시
  }
}

function encodeCursor(key?: Record<string, any>): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString('base64');
}

// ═══ 퍼블릭 ═══════════════════════════════════════════════════════════

export const hashtagPublicRoutes = new Hono<AppEnv>();

// 최신 태그 목록 (레거시 GET /hashtags — Scan → gsi1 TAGREG Query 재작성)
hashtagPublicRoutes.get('/', async (c) => {
  const limit = Math.max(1, Math.min(20, Number(c.req.query('limit') ?? '7')));
  const items = await listLatestHashtags(limit);
  return ok(c, {
    hashtags: items.map((item) => ({
      hashtag: item.hashtag,
      registeredAt: item.registeredAt,
      postCount: item.postCount ?? 0,
      creatorAnimalIcon: item.creatorPublic !== false ? item.creatorAnimalIcon : null,
    })),
  });
});

// 태그 메타 (레거시 GET /hashtags/{tag})
hashtagPublicRoutes.get('/:tag', async (c) => {
  const tag = c.req.param('tag');
  const [item, followerCount] = await Promise.all([getHashtag(tag), countFollowers(tag)]);
  if (!item) return fail(c, 404, 'HASHTAG_NOT_FOUND', '해시태그를 찾을 수 없습니다');

  const creatorPublic = item.creatorPublic !== false;
  return ok(c, {
    hashtag: item.hashtag,
    registeredAt: item.registeredAt,
    postCount: item.postCount ?? 0,
    followerCount,
    creator: creatorPublic ? { animalIcon: item.creatorAnimalIcon } : null,
  });
});

// 태그 게시물 목록 (레거시 GET /hashtags/{tag}/posts — hashtag-createdAt-index → gsi2 TAG# Query)
hashtagPublicRoutes.get('/:tag/posts', async (c) => {
  const tag = c.req.param('tag');
  const limit = Math.max(1, Math.min(50, Number(c.req.query('limit') || '20')));
  const cursor = decodeCursor(c.req.query('cursor'));

  const page = await listTagPosts(tag, limit, cursor);
  const posts = await Promise.all(
    page.items.map(async (item) => ({
      plazaPostId: item.plazaPostId,
      postType: item.postType,
      challengeTitle: item.challengeTitle,
      challengeCategory: item.challengeCategory,
      currentDay: item.currentDay,
      content: item.content,
      imageUrl: await toSignedImageUrl(item.imageUrl || null),
      hashtag: item.hashtag,
      likeCount: item.likeCount ?? 0,
      commentCount: item.commentCount ?? 0,
      createdAt: item.createdAt,
    })),
  );

  return ok(c, {
    posts,
    hasMore: Boolean(page.lastKey),
    nextCursor: encodeCursor(page.lastKey),
  });
});

// ═══ 보호 (/s/hashtags) ═══════════════════════════════════════════════

export const hashtagRoutes = new Hono<AppEnv>();

// 팔로우 여부 (레거시 GET /hashtags/{tag}/follow/status)
hashtagRoutes.get('/:tag/follow/status', async (c) => {
  const { userId } = c.get('authUser')!;
  const follow = await getFollow(c.req.param('tag'), userId);
  return ok(c, {
    followed: Boolean(follow),
    followId: follow ? follow.followId : null,
  });
});

// 팔로우 (레거시 POST /hashtags/{tag}/follow — 201 / 409 ALREADY_FOLLOWING)
hashtagRoutes.post('/:tag/follow', async (c) => {
  const { userId } = c.get('authUser')!;
  const tag = c.req.param('tag');

  const existing = await getFollow(tag, userId);
  if (existing) {
    // 레거시 바디 유지: followId 최상위 (envelope data 아님)
    return c.json(
      { error: 'ALREADY_FOLLOWING', message: '이미 팔로우 중인 해시태그입니다', followId: existing.followId },
      409,
    );
  }

  const followId = randomUUID();
  const followedAt = new Date().toISOString();
  await putFollow({ tag, userId, followId, followedAt });

  return ok(c, { followId, followedAt }, undefined, 201);
});

// 팔로우 취소 (레거시 DELETE /hashtags/{tag}/follow — 404 NOT_FOLLOWING)
hashtagRoutes.delete('/:tag/follow', async (c) => {
  const { userId } = c.get('authUser')!;
  const tag = c.req.param('tag');

  const existing = await getFollow(tag, userId);
  if (!existing) return fail(c, 404, 'NOT_FOLLOWING', '팔로우 중이 아닙니다');

  await deleteFollow(tag, userId);
  return ok(c);
});
