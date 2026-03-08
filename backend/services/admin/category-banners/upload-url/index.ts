// backend/services/admin/category-banners/upload-url/index.ts
// Admin: POST /admin/category-banners/{slug}/upload-url
// Returns a presigned S3 URL for uploading a banner image.
// The resulting fileUrl (CloudFront) should be saved as imageUrl when creating a banner.
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';

const s3Client = new S3Client({});

const VALID_SLUGS = [
  'health', 'mindfulness', 'habit', 'creativity',
  'development', 'relationship', 'expand', 'impact',
];

const schema = z.object({
  fileName: z.string().min(1).max(200),
  fileType: z.string().regex(/^image\/(jpeg|jpg|png|webp)$/),
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const slug = event.pathParameters?.slug;
    if (!slug || !VALID_SLUGS.includes(slug)) {
      return response(400, { error: 'INVALID_SLUG' });
    }

    const body = JSON.parse(event.body || '{}');
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return response(400, { error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const ext = parsed.data.fileType.split('/')[1].replace('jpeg', 'jpg');
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const key = `banners/${slug}/${timestamp}-${random}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: process.env.UPLOADS_BUCKET!,
      Key: key,
      ContentType: parsed.data.fileType,
      Metadata: {
        category: slug,
        uploadedAt: new Date().toISOString(),
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    const stage = process.env.STAGE || 'dev';
    const cloudfrontDomain = stage === 'prod' ? 'https://www.chum7.com' : 'https://test.chum7.com';
    const fileUrl = `${cloudfrontDomain}/uploads/${key}`;

    return response(200, { data: { uploadUrl, fileUrl, key, expiresIn: 300 } });
  } catch (err) {
    console.error('admin/category-banners/upload-url error', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
