/**
 * 카테고리 배너 이미지 업로드 — S3 presigned PUT (env `UPLOADS_BUCKET`).
 * user-api repo/media.ts presignFeedImagePut 패턴 미러. 키: uploads/banners/<uuid>.<ext>.
 * 저장은 CloudFront `/uploads/*` 공개 비헤이비어 URL 로 하므로 조회 시 재서명이 불필요하다.
 */
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({});

export const UPLOAD_URL_EXPIRES_SEC = 300;

/** 배너 이미지 키 — uploads/banners/<uuid>.<ext> */
export function buildBannerImageKey(contentType: string): string {
  const subtype = contentType.split('/')[1] ?? 'jpg';
  const ext = subtype === 'jpeg' ? 'jpg' : subtype;
  return `uploads/banners/${randomUUID()}.${ext}`;
}

export async function presignBannerImagePut(
  userId: string,
  key: string,
  contentType: string,
): Promise<string> {
  return getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: process.env.UPLOADS_BUCKET,
      Key: key,
      ContentType: contentType,
      Metadata: { uploadedBy: userId, uploadedAt: new Date().toISOString(), mediaKind: 'banner' },
    }),
    { expiresIn: UPLOAD_URL_EXPIRES_SEC },
  );
}
