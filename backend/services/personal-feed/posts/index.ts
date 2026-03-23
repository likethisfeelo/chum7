/**
 * personal-feed/posts — 자유 게시물 CRUD
 *
 * 라우트:
 *   POST   /personal-feed/me/posts                  게시물 작성
 *   GET    /personal-feed/{userId}/posts             게시물 목록 (visibility 필터링)
 *   PUT    /personal-feed/me/posts/{postId}          게시물 수정
 *   DELETE /personal-feed/me/posts/{postId}          게시물 삭제
 *   POST   /personal-feed/me/posts/upload-url        이미지 업로드용 presigned URL
 *
 * visibility:
 *   private   → 본인만 (layer 4)
 *   followers → 팔로워 이상 (layer 3+)
 *   mutual    → 맞팔 이상 (layer 4)
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { extractImageS3Key, isLikelySignedAssetUrl } from '../../../shared/lib/media-key';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3Client = new S3Client({});

function res(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

async function signMediaUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  if (isLikelySignedAssetUrl(raw)) return raw;

  const key = extractImageS3Key(raw);
  if (!key || !process.env.UPLOADS_BUCKET) return raw;

  const s3Key = key.startsWith('uploads/') ? key : `uploads/${key}`;
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: process.env.UPLOADS_BUCKET, Key: s3Key }),
    { expiresIn: 3600 },
  ).catch(() => raw);
}

async function getFollowStatus(
  followerId: string,
  followeeId: string,
): Promise<'none' | 'pending' | 'accepted'> {
  if (!process.env.FEED_FOLLOWS_TABLE) return 'none';
  const result = await docClient.send(new GetCommand({
    TableName: process.env.FEED_FOLLOWS_TABLE,
    Key: { followId: `${followerId}#${followeeId}` },
  }));
  if (!result.Item) return 'none';
  return result.Item.status as 'none' | 'pending' | 'accepted';
}

function visibilityAccessible(visibility: string, layer: number): boolean {
  if (visibility === 'private') return layer >= 4;
  if (visibility === 'mutual') return layer >= 4;
  if (visibility === 'followers') return layer >= 3;
  return false;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
  if (!requesterId) return res(401, { error: 'UNAUTHORIZED' });

  const method = event.requestContext.http?.method ?? event.httpMethod;
  const path = event.requestContext.http?.path ?? event.rawPath;

  try {
    // ── POST /personal-feed/me/posts/upload-url ───────────────────────
    if (method === 'POST' && path.endsWith('/upload-url')) {
      let body: { contentType?: string; fileName?: string } = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch { /* ignore */ }

      const contentType = body.contentType ?? 'image/jpeg';
      const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      const key = `personal-posts/${requesterId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;

      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: process.env.UPLOADS_BUCKET!,
          Key: `uploads/${key}`,
          ContentType: contentType,
        }),
        { expiresIn: 300 },
      );

      return res(200, { success: true, data: { uploadUrl, key } });
    }

    // ── POST /personal-feed/me/posts ──────────────────────────────────
    if (method === 'POST' && path.endsWith('/posts')) {
      let body: {
        content?: string;
        imageKeys?: string[];
        visibility?: string;
      } = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch { /* ignore */ }

      const content = (body.content ?? '').trim();
      const imageKeys: string[] = Array.isArray(body.imageKeys) ? body.imageKeys.slice(0, 5) : [];
      const visibility = ['private', 'followers', 'mutual'].includes(body.visibility ?? '')
        ? body.visibility!
        : 'followers';

      if (!content && imageKeys.length === 0) {
        return res(400, { error: 'EMPTY_POST' });
      }

      const postId = randomUUID();
      const now = new Date().toISOString();

      await docClient.send(new PutCommand({
        TableName: process.env.PERSONAL_POSTS_TABLE!,
        Item: {
          postId,
          userId: requesterId,
          content,
          imageKeys,
          visibility,
          createdAt: now,
          updatedAt: now,
        },
      }));

      return res(201, { success: true, data: { postId, visibility, createdAt: now } });
    }

    // ── GET /personal-feed/{userId}/posts ─────────────────────────────
    if (method === 'GET' && path.includes('/posts')) {
      const targetUserIdParam = event.pathParameters?.userId;
      const targetUserId = targetUserIdParam === 'me' ? requesterId : targetUserIdParam;
      if (!targetUserId) return res(400, { error: 'MISSING_USER_ID' });

      const isOwn = targetUserId === requesterId;
      let layer = 4;

      if (!isOwn) {
        const [fwd, rev] = await Promise.all([
          getFollowStatus(requesterId, targetUserId),
          getFollowStatus(targetUserId, requesterId),
        ]);
        if (fwd === 'accepted' && rev === 'accepted') {
          layer = 4;
        } else if (fwd === 'accepted') {
          layer = 3;
        } else {
          layer = 0;
        }
      }

      const nextToken = event.queryStringParameters?.nextToken;
      const limit = Math.min(Number(event.queryStringParameters?.limit ?? 20), 50);

      let exclusiveStartKey: Record<string, unknown> | undefined;
      try {
        if (nextToken) {
          exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf8'));
        }
      } catch { /* ignore */ }

      const result = await docClient.send(new QueryCommand({
        TableName: process.env.PERSONAL_POSTS_TABLE!,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': targetUserId },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }));

      // 레이어 기반 필터링
      const items = (result.Items ?? []).filter((post) =>
        isOwn || visibilityAccessible(post.visibility, layer),
      );

      // 이미지 서명
      const signedItems = await Promise.all(
        items.map(async (post) => ({
          postId: post.postId,
          userId: post.userId,
          content: post.content,
          imageUrls: await Promise.all((post.imageKeys ?? []).map(signMediaUrl)),
          visibility: post.visibility,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
        })),
      );

      const newNextToken = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
        : null;

      return res(200, { success: true, data: { posts: signedItems, nextToken: newNextToken } });
    }

    // ── PUT /personal-feed/me/posts/{postId} ──────────────────────────
    if (method === 'PUT' && path.includes('/posts/')) {
      const postId = event.pathParameters?.postId;
      if (!postId) return res(400, { error: 'MISSING_POST_ID' });

      const item = await docClient.send(new GetCommand({
        TableName: process.env.PERSONAL_POSTS_TABLE!,
        Key: { postId },
      }));
      if (!item.Item) return res(404, { error: 'NOT_FOUND' });
      if (item.Item.userId !== requesterId) return res(403, { error: 'FORBIDDEN' });

      let body: { content?: string; imageKeys?: string[]; visibility?: string } = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch { /* ignore */ }

      const updates: string[] = ['updatedAt = :now'];
      const names: Record<string, string> = {};
      const values: Record<string, unknown> = { ':now': new Date().toISOString() };

      if (body.content !== undefined) {
        updates.push('#c = :content');
        names['#c'] = 'content';
        values[':content'] = body.content.trim();
      }
      if (Array.isArray(body.imageKeys)) {
        updates.push('imageKeys = :keys');
        values[':keys'] = body.imageKeys.slice(0, 5);
      }
      if (['private', 'followers', 'mutual'].includes(body.visibility ?? '')) {
        updates.push('visibility = :vis');
        values[':vis'] = body.visibility;
      }

      await docClient.send(new UpdateCommand({
        TableName: process.env.PERSONAL_POSTS_TABLE!,
        Key: { postId },
        UpdateExpression: `SET ${updates.join(', ')}`,
        ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
      }));

      return res(200, { success: true });
    }

    // ── DELETE /personal-feed/me/posts/{postId} ───────────────────────
    if (method === 'DELETE' && path.includes('/posts/')) {
      const postId = event.pathParameters?.postId;
      if (!postId) return res(400, { error: 'MISSING_POST_ID' });

      const item = await docClient.send(new GetCommand({
        TableName: process.env.PERSONAL_POSTS_TABLE!,
        Key: { postId },
      }));
      if (!item.Item) return res(404, { error: 'NOT_FOUND' });
      if (item.Item.userId !== requesterId) return res(403, { error: 'FORBIDDEN' });

      await docClient.send(new DeleteCommand({
        TableName: process.env.PERSONAL_POSTS_TABLE!,
        Key: { postId },
      }));

      return res(200, { success: true });
    }

    return res(404, { error: 'NOT_FOUND' });
  } catch (error) {
    console.error('[personal-feed/posts] error', error);
    return res(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
