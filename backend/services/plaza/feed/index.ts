import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { extractImageS3Key } from '../../../shared/lib/media-key';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

type PlazaFilter = 'all' | 'recruiting' | 'in_progress' | 'completed';

const SINGLE_FILTER_QUERY_LIMIT = 60;
const ALL_FILTER_PER_TYPE_QUERY_LIMIT = 40;

type CursorMap = Partial<Record<string, Record<string, any>>>;

type FeedCursor = {
  perType?: CursorMap;
  legacyCursorDetected?: boolean;
};

function isDebugEnabled(raw?: string): boolean {
  const key = String(raw || '').toLowerCase();
  return key === '1' || key === 'true' || key === 'yes';
}

function decodeCursor(raw?: string): FeedCursor {
  if (!raw) return {};
  try {
    const json = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return {};

    const cursor = parsed as any;
    if (cursor.perType && typeof cursor.perType === 'object') {
      return { perType: cursor.perType };
    }

    if (cursor.lastEvaluatedKey && typeof cursor.lastEvaluatedKey === 'object') {
      return { legacyCursorDetected: true };
    }

    return {};
  } catch {
    return {};
  }
}

function encodeCursor(cursor: FeedCursor | null): string | null {
  if (!cursor?.perType || Object.keys(cursor.perType).length === 0) return null;
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
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

function toPostType(filter: PlazaFilter): string[] {
  if (filter === 'recruiting') return ['recruitment'];
  if (filter === 'in_progress') return ['progress_update'];
  if (filter === 'completed') return ['courtyard', 'badge_review'];
  return ['courtyard', 'recruitment', 'progress_update', 'badge_review'];
}


function normalizeFilter(rawFilter?: string): PlazaFilter {
  if (rawFilter === 'recruiting' || rawFilter === 'in_progress' || rawFilter === 'completed' || rawFilter === 'all') {
    return rawFilter;
  }
  return 'all';
}

function queryByPostType(postType: string, limit: number, exclusiveStartKey?: Record<string, any>) {
  return ddb.send(new QueryCommand({
    TableName: process.env.PLAZA_POSTS_TABLE!,
    IndexName: 'postType-createdAt-index',
    KeyConditionExpression: 'postType = :postType',
    ExpressionAttributeValues: { ':postType': postType },
    ScanIndexForward: false,
    ExclusiveStartKey: exclusiveStartKey,
    Limit: limit,
  }));
}

function exposureScore(post: any, nowMs: number): number {
  const createdMs = new Date(post.createdAt || 0).getTime();
  const ageHours = Math.max(0, (nowMs - createdMs) / (1000 * 60 * 60));
  const freshness = Math.max(0, 100 - ageHours * 8);
  const reaction = (post.likeCount || 0) * 1 + (post.commentCount || 0) * 2 + (post.bookmarkCount || 0) * 1.5;
  const typeWeight = post.postType === 'recruitment' && (post.remainingSlots || 0) > 0 ? 1.3 : 1;
  return (freshness + reaction) * typeWeight;
}

async function toSignedImageUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  // Already a new-format CloudFront URL — publicly accessible
  if ((raw.includes('chum7.com') || raw.includes('cloudfront.net')) && raw.includes('/uploads/')) return raw;
  const key = extractImageS3Key(raw);
  if (!key || !process.env.UPLOADS_BUCKET) return raw;
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.UPLOADS_BUCKET, Key: key }),
      { expiresIn: 3600 },
    );
  } catch (err) {
    console.error('Failed to sign plaza image url:', err);
    return raw;
  }
}

async function sanitizePost(post: any, debugCollector?: Array<Record<string, unknown>>): Promise<any> {
  const {
    sourceUserId,
    sourceId,
    sourceType,
    sourceChallengeId,
    sourceLeaderId,
    exposureScore: _ignored,
    ...safe
  } = post;

  const imageUrl = await toSignedImageUrl(safe.imageUrl || null);

  if (debugCollector) {
    debugCollector.push({
      plazaPostId: safe.plazaPostId || null,
      postType: safe.postType || null,
      rawImageUrl: safe.imageUrl || null,
      extractedKey: extractImageS3Key(safe.imageUrl || null),
      normalizedImageUrl: imageUrl || null,
    });
  }

  return {
    ...safe,
    imageUrl,
    challengeId: safe.challengeId || sourceChallengeId || null,
    leaderId: safe.leaderId || sourceLeaderId || null,
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const params = event.queryStringParameters || {};
    const filter = normalizeFilter(params.filter);
    const limit = Math.max(1, Math.min(50, Number(params.limit || '20')));
    const cursor = decodeCursor(params.cursor);
    const debugEnabled = isDebugEnabled(params.debug);
    const debugImageSamples: Array<Record<string, unknown>> = [];

    const allowTypes = toPostType(filter);
    const nowMs = Date.now();
    const perTypeCursor = cursor.perType || {};

    if (cursor.legacyCursorDetected) {
      console.warn('Detected legacy plaza feed cursor format; restarting pagination with new perType cursor format.');
    }

    if (filter !== 'all') {
      const postType = allowTypes[0];
      const queryRes = await queryByPostType(postType, Math.min(SINGLE_FILTER_QUERY_LIMIT, limit), perTypeCursor[postType]);

      const items = (queryRes.Items || [])
        .filter((item: any) => item?.isActive !== false)
        .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      const posts = await Promise.all(items.slice(0, limit).map((item: any) => sanitizePost(item, debugEnabled ? debugImageSamples : undefined)));
      const nextPerType: CursorMap = {};
      if (queryRes.LastEvaluatedKey) nextPerType[postType] = queryRes.LastEvaluatedKey;

      return response(200, {
        success: true,
        data: {
          posts,
          hasMore: Boolean(queryRes.LastEvaluatedKey),
          nextCursor: encodeCursor({ perType: nextPerType }),
          ...(debugEnabled ? {
            _debug: {
              filter,
              limit,
              returnedPosts: posts.length,
              legacyCursorDetected: Boolean(cursor.legacyCursorDetected),
              imageNormalizationSamples: debugImageSamples.slice(0, 20),
            }
          } : {}),
        },
      });
    }

    const queryLimitPerType = Math.max(limit, ALL_FILTER_PER_TYPE_QUERY_LIMIT);
    const typeResults = await Promise.all(
      allowTypes.map(async (postType) => {
        const queryRes = await queryByPostType(postType, queryLimitPerType, perTypeCursor[postType]);
        const items = (queryRes.Items || [])
          .filter((item: any) => item?.isActive !== false)
          .map((item: any) => ({
            ...item,
            _score: typeof item.exposureScore === 'number' ? item.exposureScore : exposureScore(item, nowMs),
          }));

        return {
          postType,
          items,
          lastEvaluatedKey: queryRes.LastEvaluatedKey as Record<string, any> | undefined,
        };
      })
    );

    const sorted = typeResults
      .flatMap((result) => result.items)
      .sort((a: any, b: any) => (b._score || 0) - (a._score || 0));

    const posts = await Promise.all(sorted.slice(0, limit).map((item: any) => sanitizePost(item, debugEnabled ? debugImageSamples : undefined)));

    const nextPerType: CursorMap = {};
    for (const result of typeResults) {
      if (result.lastEvaluatedKey) {
        nextPerType[result.postType] = result.lastEvaluatedKey;
      }
    }

    return response(200, {
      success: true,
      data: {
        posts,
        hasMore: Object.keys(nextPerType).length > 0,
        nextCursor: encodeCursor({ perType: nextPerType }),
        ...(debugEnabled ? {
          _debug: {
            filter,
            limit,
            returnedPosts: posts.length,
            legacyCursorDetected: Boolean(cursor.legacyCursorDetected),
            imageNormalizationSamples: debugImageSamples.slice(0, 20),
          }
        } : {}),
      },
    });
  } catch (error: any) {
    console.error('Plaza feed error:', error);
    return response(500, {
      message: 'INTERNAL_SERVER_ERROR',
      error: error?.message || 'unknown error',
    });
  }
};
