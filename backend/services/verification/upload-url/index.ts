// backend/services/verification/upload-url/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';

const s3Client = new S3Client({});

const uploadUrlSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().regex(/^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|webm|quicktime))$/),
  challengeId: z.string().uuid()
});

type UploadUrlInput = z.infer<typeof uploadUrlSchema>;

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    const body = JSON.parse(event.body || '{}');
    const input: UploadUrlInput = uploadUrlSchema.parse(body);

    // 파일 확장자 추출
    const fileExtension = input.fileType === 'video/quicktime'
      ? 'mov'
      : input.fileType.split('/')[1];
    
    // S3 키 생성: userId/challengeId/timestamp-random.ext
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const key = `${userId}/${input.challengeId}/${timestamp}-${random}.${fileExtension}`;

    // Presigned URL 생성
    const command = new PutObjectCommand({
      Bucket: process.env.UPLOADS_BUCKET!,
      Key: key,
      ContentType: input.fileType,
      Metadata: {
        uploadedBy: userId,
        challengeId: input.challengeId,
        uploadedAt: new Date().toISOString()
      }
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300 // 5분
    });

    // CloudFront URL
    const stage = process.env.STAGE || 'dev';
    const cloudfrontDomain = stage === 'prod'
      ? 'https://www.chum7.com'
      : 'https://test.chum7.com';
    
    const fileUrl = `${cloudfrontDomain}/uploads/${key}`;

    return response(200, {
      success: true,
      data: {
        uploadUrl,
        fileUrl,
        key,
        expiresIn: 300
      }
    });

  } catch (error: any) {
    console.error('Generate upload URL error:', error);

    if (error instanceof z.ZodError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors
      });
    }

    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
