/**
 * 마당(plaza) 라우트.
 * 퍼블릭: GET /public/plaza/feed, GET /public/plaza/:plazaPostId(/comments)
 * 보호:   POST /s/plaza/posts, POST /s/plaza/:plazaPostId/comments,
 *         POST·DELETE /s/plaza/:plazaPostId/react,
 *         GET /s/plaza/recommendations, POST /s/plaza/recommendations/:recommendationId/dismiss
 * 레거시: backend/services/plaza/{feed,comments,react,recommend,dismiss-recommendation}
 */
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { AppEnv } from '@chum7/api-kit';
import { ok, fail, publishEvent } from '@chum7/api-kit';
import { createPlazaPostSchema, plazaCommentSchema, plazaReactSchema } from '../schemas';
import {
  exposureScore,
  normalizeFilter,
  sanitizePost,
  toAnimalIcon,
  toCreatorAnimalIcon,
  toPostTypes,
} from '../domain/plaza-view';
import { resolvePrimaryHashtag } from '../domain/hashtags';
import { decodeFeedCursor, encodeFeedCursor, CursorMap } from '../domain/pagination';
import {
  buildPostKeys,
  countReactions,
  deletePostComment,
  deleteReaction,
  getOrAssignAnonNumber,
  getPost,
  incrementPostCounter,
  listPostComments,
  listSuppressedChallengeIds,
  putPost,
  putPostComment,
  putReaction,
  putRecommendationDismissal,
  queryFeedByPostType,
  setPostLikeCount,
  commentSk,
} from '../repo/plaza';
import { registerHashtag } from '../repo/hashtags';
import { toSignedImageUrl } from '../repo/media';
import { stripKeys } from '../repo/shared';

const SINGLE_FILTER_QUERY_LIMIT = 60;
const ALL_FILTER_PER_TYPE_QUERY_LIMIT = 40;

async function toPublicPost(item: Record<string, any>): Promise<Record<string, any>> {
  const sanitized = sanitizePost(stripKeys(item));
  sanitized.imageUrl = await toSignedImageUrl(sanitized.imageUrl || null);
  return sanitized;
}

/** 레거시 댓글(순번 미보유) 표시용 — 기존 프론트 파생과 동일한 10–99 매핑 */
function legacyAnonNumber(icon: string): number {
  const sum = [...(icon || '')].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (sum % 90) + 10;
}

function commentView(item: Record<string, any>, userId?: string) {
  const anonymousNumber =
    typeof item.anonymousNumber === 'number'
      ? item.anonymousNumber
      : legacyAnonNumber(item.animalIcon);
  return {
    commentId: item.commentId,
    anonymousNumber,
    displayName: `아무개${anonymousNumber}`,
    animalIcon: item.animalIcon, // 하위 호환 (구 프론트)
    content: item.content,
    createdAt: item.createdAt,
    isMine: Boolean(userId && item.userId === userId),
  };
}

// ═══ 퍼블릭 ═══════════════════════════════════════════════════════════

/** 댓글 페이지 빌드 — 퍼블릭/인증 라우트 공용. viewerUserId 있으면 isMine 계산됨. */
async function buildCommentsPage(
  plazaPostId: string,
  limitRaw: string | undefined,
  cursorRaw: string | undefined,
  viewerUserId?: string,
) {
  const limit = Math.max(1, Math.min(100, Number(limitRaw || '50')));
  let exclusiveStartKey: Record<string, any> | undefined;
  if (cursorRaw) {
    try {
      const parsed = JSON.parse(Buffer.from(cursorRaw, 'base64').toString('utf8'));
      exclusiveStartKey = parsed?.lastEvaluatedKey ?? undefined;
    } catch {
      exclusiveStartKey = undefined; // 손상 커서는 무시
    }
  }
  const page = await listPostComments(plazaPostId, limit, exclusiveStartKey);
  const hasMore = Boolean(page.lastKey);
  return {
    comments: page.items.map((item) => commentView(item, viewerUserId)),
    hasMore,
    nextCursor: hasMore
      ? Buffer.from(JSON.stringify({ lastEvaluatedKey: page.lastKey })).toString('base64')
      : null,
  };
}

export const plazaPublicRoutes = new Hono<AppEnv>();

// 피드 (레거시 GET /plaza/feed — postType-createdAt-index → gsi1 FEED#<postType> Query)
plazaPublicRoutes.get('/feed', async (c) => {
  const filter = normalizeFilter(c.req.query('filter'));
  const limit = Math.max(1, Math.min(50, Number(c.req.query('limit') || '20')));
  const cursor = decodeFeedCursor(c.req.query('cursor'));
  const hashtag = c.req.query('hashtag')?.trim() || undefined;

  const allowTypes = toPostTypes(filter);
  const nowMs = Date.now();
  const perTypeCursor = cursor.perType || {};

  if (cursor.legacyCursorDetected) {
    console.warn('Detected legacy plaza feed cursor format; restarting pagination with new perType cursor format.');
  }

  if (filter !== 'all') {
    const postType = allowTypes[0]!;
    const page = await queryFeedByPostType(
      postType,
      Math.min(SINGLE_FILTER_QUERY_LIMIT, limit),
      perTypeCursor[postType],
      postType === 'courtyard' ? hashtag : undefined,
    );
    const items = page.items
      .filter((item) => item?.isActive !== false)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const posts = await Promise.all(items.slice(0, limit).map(toPublicPost));
    const nextPerType: CursorMap = {};
    if (page.lastKey) nextPerType[postType] = page.lastKey;

    return ok(c, {
      posts,
      hasMore: Boolean(page.lastKey),
      nextCursor: encodeFeedCursor({ perType: nextPerType }),
    });
  }

  const queryLimitPerType = Math.max(limit, ALL_FILTER_PER_TYPE_QUERY_LIMIT);
  const typeResults = await Promise.all(
    allowTypes.map(async (postType) => {
      const page = await queryFeedByPostType(
        postType,
        queryLimitPerType,
        perTypeCursor[postType],
        postType === 'courtyard' ? hashtag : undefined,
      );
      const items = page.items
        .filter((item) => item?.isActive !== false)
        .map((item) => ({
          ...item,
          _score: typeof item.exposureScore === 'number' ? item.exposureScore : exposureScore(item, nowMs),
        }));
      return { postType, items, lastKey: page.lastKey };
    }),
  );

  const sorted = typeResults.flatMap((r) => r.items).sort((a, b) => (b._score || 0) - (a._score || 0));
  const posts = await Promise.all(sorted.slice(0, limit).map(toPublicPost));

  const nextPerType: CursorMap = {};
  for (const result of typeResults) {
    if (result.lastKey) nextPerType[result.postType] = result.lastKey;
  }

  return ok(c, {
    posts,
    hasMore: Object.keys(nextPerType).length > 0,
    nextCursor: encodeFeedCursor({ perType: nextPerType }),
  });
});

// 게시물 상세 (신규 표면 — 피드 아이템과 동일한 sanitize/서명 정책)
plazaPublicRoutes.get('/:plazaPostId', async (c) => {
  const post = await getPost(c.req.param('plazaPostId'));
  if (!post || post.isActive === false) {
    return fail(c, 404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다');
  }
  return ok(c, await toPublicPost(post));
});

// 댓글 목록 (퍼블릭 — 비로그인 열람. 클레임 없어 isMine 항상 false)
plazaPublicRoutes.get('/:plazaPostId/comments', async (c) => {
  return ok(
    c,
    await buildCommentsPage(c.req.param('plazaPostId'), c.req.query('limit'), c.req.query('cursor')),
  );
});

// ═══ 보호 (/s/plaza) ══════════════════════════════════════════════════

export const plazaRoutes = new Hono<AppEnv>();

// 게시물 작성 (신규 표면 — 모집글/진행소식/뱃지후기. courtyard는 plaza-converter 전용)
plazaRoutes.post('/posts', async (c) => {
  const { userId } = c.get('authUser')!;
  const input = createPlazaPostSchema.parse(await c.req.json());
  const now = new Date();
  const nowIso = now.toISOString();
  const plazaPostId = `${input.postType}-${randomUUID()}`;

  const { primary, all } = resolvePrimaryHashtag(input.hashtag, input.content);

  const post: Record<string, any> = {
    ...buildPostKeys({ plazaPostId, postType: input.postType, createdAt: nowIso, hashtag: primary }),
    plazaPostId,
    postType: input.postType,
    content: input.content,
    imageUrl: input.imageUrl ?? null,
    challengeTitle: input.challengeTitle ?? null,
    challengeCategory: input.challengeCategory ?? null,
    currentDay: input.currentDay ?? null,
    leaderId: null,
    leaderName: input.leaderName ?? null,
    leaderMessage: input.leaderMessage ?? null,
    recruitmentData: input.recruitmentData ?? null,
    sourceType: 'user',
    sourceId: null,
    sourceChallengeId: input.challengeId ?? undefined,
    sourceLeaderId: undefined,
    sourceUserId: userId,
    authorId: userId,
    likeCount: 0,
    commentCount: 0,
    bookmarkCount: 0,
    isActive: true,
    createdAt: nowIso,
    ...(primary ? { hashtag: primary } : {}),
  };

  await putPost(post);

  // 해시태그 레지스트리 유지 (레거시 verification/submit 정책 승계 — 최초 등록자 기록 + postCount)
  for (const tag of all) {
    await registerHashtag({
      hashtag: tag,
      creatorUserId: userId,
      creatorAnimalIcon: toCreatorAnimalIcon(userId),
      now: nowIso,
    });
  }

  return ok(c, await toPublicPost(post), '게시글이 등록되었습니다', 201);
});

// 댓글 작성 (레거시 POST /plaza/{id}/comments)
plazaRoutes.post('/:plazaPostId/comments', async (c) => {
  const { userId } = c.get('authUser')!;
  const plazaPostId = c.req.param('plazaPostId');
  const input = plazaCommentSchema.parse(await c.req.json().catch(() => ({})));

  const now = new Date().toISOString();
  const commentId = randomUUID();
  // 게시물별 고정 익명 순번(아무개N) — 8이모지 방식 폐기(P1-3). animalIcon은 하위 호환용으로만 병기.
  const anonymousNumber = await getOrAssignAnonNumber(plazaPostId, userId, now);
  const animalIcon = toAnimalIcon(`${userId}:${plazaPostId}`);

  await putPostComment({
    pk: `POST#${plazaPostId}`,
    sk: commentSk(now, commentId),
    commentId,
    plazaPostId,
    userId,
    anonymousNumber,
    animalIcon,
    content: input.content,
    createdAt: now,
  });
  await incrementPostCounter(plazaPostId, 'commentCount', 1, now);

  const post = await getPost(plazaPostId);
  const targetOwnerId = post?.sourceUserId || post?.authorId || post?.leaderId || null;
  if (targetOwnerId) {
    await publishEvent('comment.created', {
      targetType: 'plaza',
      targetId: plazaPostId,
      targetOwnerId,
      authorId: userId,
      commentId,
    });
  }

  return ok(c, {
    commentId,
    anonymousNumber,
    displayName: `아무개${anonymousNumber}`,
    animalIcon,
    content: input.content,
    createdAt: now,
    isMine: true,
  });
});

// 댓글 목록 (인증 — 로그인 시 isMine 정확 계산. 프론트는 로그인 상태면 이 경로 사용)
plazaRoutes.get('/:plazaPostId/comments', async (c) => {
  const { userId } = c.get('authUser')!;
  return ok(
    c,
    await buildCommentsPage(
      c.req.param('plazaPostId'),
      c.req.query('limit'),
      c.req.query('cursor'),
      userId,
    ),
  );
});

// 댓글 삭제 (본인만). sk 재구성을 위해 createdAt 쿼리 필요.
plazaRoutes.delete('/:plazaPostId/comments/:commentId', async (c) => {
  const { userId } = c.get('authUser')!;
  const plazaPostId = c.req.param('plazaPostId');
  const commentId = c.req.param('commentId');
  const createdAt = c.req.query('createdAt');
  if (!createdAt) return fail(c, 400, 'MISSING_CREATED_AT', 'createdAt 쿼리가 필요합니다');

  const deleted = await deletePostComment(plazaPostId, commentSk(createdAt, commentId), userId);
  if (!deleted) {
    return fail(c, 404, 'COMMENT_NOT_FOUND', '삭제할 댓글이 없거나 권한이 없습니다');
  }
  await incrementPostCounter(plazaPostId, 'commentCount', -1, new Date().toISOString());
  return ok(c, { deleted: true, commentId });
});

// 리액션 추가 (레거시 POST /plaza/{id}/react — 유저당 1개 RCT#<userId>)
plazaRoutes.post('/:plazaPostId/react', async (c) => {
  const { userId } = c.get('authUser')!;
  const plazaPostId = c.req.param('plazaPostId');
  const input = plazaReactSchema.parse(await c.req.json().catch(() => ({})));
  const now = new Date().toISOString();

  const post = await getPost(plazaPostId);
  if (!post) {
    // 레거시의 verifications 테이블 폴백은 크로스 도메인 접근 금지로 제거 (PORTING.md gap ⑤)
    return fail(c, 404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다');
  }

  const challengeId = input.challengeId || post.sourceChallengeId || null;
  await putReaction(plazaPostId, userId, input.reactionType || 'like', challengeId, now);

  const likeCount = await countReactions(plazaPostId);
  await setPostLikeCount(plazaPostId, likeCount, now);

  // 관계 원장 신호 — 게시물 소유자에게 리액션(본인 제외)
  const reactionOwnerId = post.sourceUserId || post.authorId || post.leaderId || null;
  if (reactionOwnerId && reactionOwnerId !== userId) {
    await publishEvent('reaction.created', {
      targetType: 'plaza',
      targetId: plazaPostId,
      targetOwnerId: reactionOwnerId,
      actorUserId: userId,
      emoji: input.reactionType || 'like',
    });
  }

  const recommendation = challengeId
    ? {
        recommendationId: `${userId}#${challengeId}`,
        challengeId,
        challengeTitle: post.challengeTitle || '추천 챌린지',
        isRecruiting: true,
        message: '방금 공감한 기록이 이 챌린지에서 나왔어요.',
      }
    : null;

  return ok(c, { likeCount, myReaction: 'like', recommendation });
});

// 리액션 취소 (신규 표면 — RCT#<userId> delete)
plazaRoutes.delete('/:plazaPostId/react', async (c) => {
  const { userId } = c.get('authUser')!;
  const plazaPostId = c.req.param('plazaPostId');
  const now = new Date().toISOString();

  const post = await getPost(plazaPostId);
  if (!post) return fail(c, 404, 'POST_NOT_FOUND', '게시물을 찾을 수 없습니다');

  await deleteReaction(plazaPostId, userId);
  const likeCount = await countReactions(plazaPostId);
  await setPostLikeCount(plazaPostId, likeCount, now);

  return ok(c, { likeCount, myReaction: null });
});

// 추천 목록 (레거시 GET /plaza/recommendations — v1 축소판, PORTING.md gap ⑥)
plazaRoutes.get('/recommendations', async (c) => {
  const { userId } = c.get('authUser')!;
  const plazaPostId = c.req.query('plazaPostId');
  const verificationId = c.req.query('verificationId');
  const limit = Math.max(1, Math.min(10, Number(c.req.query('limit') || '3')));
  if (!plazaPostId && !verificationId) {
    return fail(c, 400, 'MISSING_PARAMS', 'verificationId 또는 plazaPostId가 필요합니다');
  }

  const nowMs = Date.now();
  const post = plazaPostId ? await getPost(plazaPostId) : null;
  const sourceChallengeId: string | null = post?.sourceChallengeId || post?.challengeId || null;
  const suppressed = await listSuppressedChallengeIds(userId, nowMs);

  const recommendations: any[] = [];
  if (sourceChallengeId && !suppressed.has(sourceChallengeId)) {
    recommendations.push({
      id: `${userId}#${sourceChallengeId}#source`,
      challengeId: sourceChallengeId,
      challengeTitle: post?.challengeTitle || '추천 챌린지',
      completionRate: 0,
      isRecruiting: true,
      reason: '방금 공감한 기록이 이 챌린지에서 나왔어요.',
    });
  }

  return ok(c, { recommendations: recommendations.slice(0, limit) });
});

// 추천 숨김 (레거시 POST /recommendations/{id}/dismiss — 48시간 억제 + TTL)
plazaRoutes.post('/recommendations/:recommendationId/dismiss', async (c) => {
  const { userId } = c.get('authUser')!;
  const recommendationId = c.req.param('recommendationId');
  const now = new Date();
  const suppressUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const parts = recommendationId.split('#');
  const recommendedChallengeId = parts.length >= 2 ? parts[1] || null : null;

  await putRecommendationDismissal({ userId, recommendationId, recommendedChallengeId, now, suppressUntil });

  return ok(c, { suppressUntil: suppressUntil.toISOString() });
});
