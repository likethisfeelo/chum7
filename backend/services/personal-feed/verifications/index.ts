import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { extractImageS3Key, isLikelySignedAssetUrl } from '../../../shared/lib/media-key';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3Client = new S3Client({});

const DEFAULT_LIMIT = 20;

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!requesterId) {
      return response(401, { error: 'UNAUTHORIZED', message: '인증이 필요합니다' });
    }

    const userIdParam = event.pathParameters?.userId;
    const targetUserId = userIdParam === 'me' ? requesterId : userIdParam;
    if (!targetUserId) {
      return response(400, { error: 'MISSING_USER_ID', message: 'userId가 필요합니다' });
    }

    const params = event.queryStringParameters ?? {};
    const limit = Math.min(Number(params.limit ?? DEFAULT_LIMIT), 50);
    const nextTokenRaw = params.nextToken;

    let exclusiveStartKey: Record<string, unknown> | undefined;
    if (nextTokenRaw) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(nextTokenRaw, 'base64url').toString('utf-8'));
      } catch {
        return response(400, { error: 'INVALID_NEXT_TOKEN', message: '잘못된 페이지 토큰입니다' });
      }
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.VERIFICATIONS_TABLE!,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': targetUserId },
      ScanIndexForward: false, // 최신순
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }));

    const items = await Promise.all((result.Items ?? []).map(async (v) => ({
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
    })));

    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
      : null;

    return response(200, {
      success: true,
      data: { items, nextToken },
    });
  } catch (error) {
    console.error('[personal-feed/verifications] error', error);
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
