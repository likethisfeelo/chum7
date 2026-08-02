/**
 * 미디어 URL 재서명 — 레거시 plaza/feed toSignedImageUrl 정책 이식.
 * media-key(단일 진입점)로 S3 키를 추출해 1시간 presigned GET URL 발급.
 * 이미 서명된 URL·CloudFront /uploads/ URL은 그대로 반환.
 */
import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { extractImageS3Key, isLikelySignedAssetUrl } from '../domain/media-key';

const s3 = new S3Client({});

export const PLAZA_UPLOAD_URL_EXPIRES_SEC = 300;

/** 운영자 마당 게시물 이미지 키 — uploads/plaza/<uuid>.<ext> (CloudFront /uploads/* 공개 URL) */
export function buildPlazaImageKey(contentType: string): string {
  const subtype = contentType.split('/')[1] ?? 'jpg';
  const ext = subtype === 'jpeg' ? 'jpg' : subtype;
  return `uploads/plaza/${randomUUID()}.${ext}`;
}

/** 운영자 마당 게시물 이미지 presigned PUT — admin-api repo/media presignBannerImagePut 패턴 미러 */
export async function presignPlazaImagePut(
  userId: string,
  key: string,
  contentType: string,
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.UPLOADS_BUCKET,
      Key: key,
      ContentType: contentType,
      Metadata: { uploadedBy: userId, uploadedAt: new Date().toISOString(), mediaKind: 'plaza-admin' },
    }),
    { expiresIn: PLAZA_UPLOAD_URL_EXPIRES_SEC },
  );
}

export async function toSignedImageUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  if (isLikelySignedAssetUrl(raw)) return raw;
  const key = extractImageS3Key(raw);
  if (!key || !process.env.UPLOADS_BUCKET) return raw;
  const s3Key = key.startsWith('uploads/') ? key : `uploads/${key}`;
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.UPLOADS_BUCKET, Key: s3Key }),
      { expiresIn: 3600 },
    );
  } catch (err) {
    console.error('Failed to sign plaza image url:', err);
    return raw;
  }
}
