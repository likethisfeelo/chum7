import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION || 'ap-northeast-2' 
});

interface UploadUrlParams {
  key: string;
  contentType: string;
  expiresIn?: number;
}

interface UploadUrlResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}

/**
 * S3 Presigned URL 생성 (이미지 업로드용)
 */
export async function generateUploadUrl(
  params: UploadUrlParams
): Promise<UploadUrlResponse> {
  const { key, contentType, expiresIn = 300 } = params;
  
  const bucket = process.env.UPLOADS_BUCKET!;
  const stage = process.env.STAGE || 'dev';
  
  // 업로드용 Presigned URL 생성
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Metadata: {
      uploadedAt: new Date().toISOString(),
      stage
    }
  });
  
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  
  // CloudFront를 통한 접근 URL
  const cloudfrontDomain = stage === 'prod' 
    ? 'https://www.chum7.com'
    : 'https://test.chum7.com';
  
  const fileUrl = `${cloudfrontDomain}/uploads/${key}`;
  
  return { uploadUrl, fileUrl, key };
}

/**
 * 이미지 키 생성 (userId/challengeId/timestamp-random.ext)
 */
export function generateImageKey(
  userId: string,
  challengeId: string,
  fileExtension: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${userId}/${challengeId}/${timestamp}-${random}.${fileExtension}`;
}

/**
 * CloudFront URL 생성
 */
export function getCloudFrontUrl(key: string): string {
  const stage = process.env.STAGE || 'dev';
  const cloudfrontDomain = stage === 'prod'
    ? 'https://www.chum7.com'
    : 'https://test.chum7.com';
  
  return `${cloudfrontDomain}/uploads/${key}`;
}

export const s3 = {
  generateUploadUrl,
  generateImageKey,
  getCloudFrontUrl
};