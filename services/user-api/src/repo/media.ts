/**
 * 자유글 이미지 미디어 — S3 presigned URL (env `UPLOADS_BUCKET`).
 * 업로드: challenge-api verifications-read upload-url 구현 미러 (presigned PUT 300초).
 * 조회: 레거시 personal-feed/posts signMediaUrl 정책 승계 (키 → 1시간 presigned GET).
 */
import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({});

export const UPLOAD_URL_EXPIRES_SEC = 300;

/** 자유글 이미지 키 — uploads/<userId>/feed/<uuid>.<ext> */
export function buildFeedImageKey(userId: string, contentType: string): string {
  const subtype = contentType.split('/')[1] ?? 'jpg';
  const ext = subtype === 'jpeg' ? 'jpg' : subtype;
  return `uploads/${userId}/feed/${randomUUID()}.${ext}`;
}

export async function presignFeedImagePut(
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
      Metadata: { uploadedBy: userId, uploadedAt: new Date().toISOString(), mediaKind: 'image' },
    }),
    { expiresIn: UPLOAD_URL_EXPIRES_SEC },
  );
}

/** 이미 서명된 URL 인지 (media-key isLikelySignedAssetUrl 축약 — 키 저장이 기본이라 최소 검사) */
function isSignedUrl(raw: string): boolean {
  try {
    const keys = new Set(
      Array.from(new URL(raw).searchParams.keys()).map((k) => k.toLowerCase()),
    );
    return keys.has('x-amz-signature') || keys.has('x-amz-algorithm');
  } catch {
    return false;
  }
}

/** imageKeys 항목(키 또는 URL) → 렌더 가능한 URL (1시간 presigned GET). 실패 시 원본 반환. */
export async function signFeedImageUrl(keyOrUrl?: string | null): Promise<string | null> {
  if (!keyOrUrl) return null;
  const raw = String(keyOrUrl).trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    if (isSignedUrl(raw)) return raw;
    // CloudFront /uploads/ 경로만 재서명 대상 — 그 외 외부 URL 은 그대로
    try {
      const pathname = new URL(raw).pathname;
      if (!pathname.startsWith('/uploads/')) return raw;
      return await presignGet(pathname.replace(/^\//, ''));
    } catch {
      return raw;
    }
  }
  const key = raw.replace(/^\/+/, '');
  return presignGet(key.startsWith('uploads/') ? key : `uploads/${key}`);
}

async function presignGet(s3Key: string): Promise<string> {
  if (!process.env.UPLOADS_BUCKET) return s3Key;
  try {
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: process.env.UPLOADS_BUCKET, Key: s3Key }),
      { expiresIn: 3600 },
    );
  } catch (error) {
    console.error('Failed to sign feed image url:', error);
    return s3Key;
  }
}
