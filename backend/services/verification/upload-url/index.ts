// backend/services/verification/upload-url/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { isValidTrimRange } from "../../../shared/lib/trim-validation";

const s3Client = new S3Client({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const uploadUrlSchema = z.object({
  fileName: z.string().min(1),
  fileType: z
    .string()
    .regex(
      /^(image\/(jpeg|jpg|png|webp|gif|heic|heif|heic-sequence|heif-sequence)|video\/(mp4|webm|quicktime))$/,
    ),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 500),
  challengeId: z.string().min(1).optional(),
  userChallengeId: z.string().uuid().optional(),
  mediaKind: z.enum(["video", "image"]).optional(),
  trimStartSec: z.number().min(0).max(60).optional(),
  trimEndSec: z.number().min(0).max(60).optional(),
  videoDurationSec: z.number().min(0).max(60).optional(),
});

type UploadUrlInput = z.infer<typeof uploadUrlSchema>;

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

function getMaxSizeBytes(fileType: string): number {
  return fileType.startsWith("video/")
    ? MAX_VIDEO_SIZE_BYTES
    : MAX_IMAGE_SIZE_BYTES;
}

function toSafePathSegment(raw: string): string {
  const normalized = String(raw || "").trim();
  if (!normalized) return "unknown-challenge";
  return normalized.replace(/[^a-zA-Z0-9-_.]/g, "-");
}

async function resolveChallengeId(
  input: UploadUrlInput,
  userId: string,
): Promise<string | null> {
  if (input.challengeId?.trim()) return input.challengeId.trim();

  if (!input.userChallengeId || !process.env.USER_CHALLENGES_TABLE) {
    return null;
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.USER_CHALLENGES_TABLE,
      Key: { userChallengeId: input.userChallengeId },
    }),
  );

  const userChallenge = result.Item;
  if (!userChallenge) return null;
  if (userChallenge.userId && userChallenge.userId !== userId) return null;

  return typeof userChallenge.challengeId === "string" &&
    userChallenge.challengeId.trim()
    ? userChallenge.challengeId.trim()
    : null;
}

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;

    if (!userId) {
      return response(401, {
        error: "UNAUTHORIZED",
        message: "인증이 필요합니다",
      });
    }

    const body = JSON.parse(event.body || "{}");
    const input: UploadUrlInput = uploadUrlSchema.parse(body);

    const maxSizeBytes = getMaxSizeBytes(input.fileType);

    if (
      (input.mediaKind === "video" || input.fileType.startsWith("video/")) &&
      !isValidTrimRange(input.trimStartSec, input.trimEndSec)
    ) {
      return response(400, {
        error: "INVALID_TRIM_RANGE",
        message: "trimStartSec/trimEndSec 범위가 올바르지 않습니다",
      });
    }
    if (input.fileSize > maxSizeBytes) {
      return response(400, {
        error: "FILE_SIZE_EXCEEDED",
        message: input.fileType.startsWith("video/")
          ? "영상은 500MB 이내만 업로드할 수 있습니다"
          : "이미지는 10MB 이내만 업로드할 수 있습니다",
        maxSizeBytes,
      });
    }

    if (!process.env.UPLOADS_BUCKET) {
      return response(500, {
        error: "UPLOADS_BUCKET_NOT_CONFIGURED",
        message: "업로드 설정이 올바르지 않습니다",
      });
    }

    const resolvedChallengeId = await resolveChallengeId(input, userId);
    const challengeSegment = toSafePathSegment(
      resolvedChallengeId || input.challengeId || "unknown-challenge",
    );

    // 파일 확장자 추출
    const fileExtension =
      input.fileType === "video/quicktime"
        ? "mov"
        : input.fileType === "image/jpeg" || input.fileType === "image/jpg"
          ? "jpg"
          : input.fileType === "image/heic-sequence"
            ? "heic"
            : input.fileType === "image/heif-sequence"
              ? "heif"
              : input.fileType.split("/")[1];

    // S3 키 생성: uploads/userId/challengeId/timestamp-random.ext
    // "uploads/" prefix는 CloudFront /uploads/* 동작이 S3 키를 직접 매핑하기 위해 필요합니다.
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const key = `uploads/${userId}/${challengeSegment}/${timestamp}-${random}.${fileExtension}`;

    // Presigned URL 생성
    const command = new PutObjectCommand({
      Bucket: process.env.UPLOADS_BUCKET,
      Key: key,
      ContentType: input.fileType,
      ContentLength: input.fileSize,
      Metadata: {
        uploadedBy: userId,
        challengeId:
          resolvedChallengeId || input.challengeId || "unknown-challenge",
        uploadedAt: new Date().toISOString(),
        mediaKind:
          input.mediaKind ||
          (input.fileType.startsWith("video/") ? "video" : "image"),
        trimStartSec:
          input.trimStartSec !== undefined ? String(input.trimStartSec) : "",
        trimEndSec:
          input.trimEndSec !== undefined ? String(input.trimEndSec) : "",
        videoDurationSec:
          input.videoDurationSec !== undefined
            ? String(input.videoDurationSec)
            : "",
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300, // 5분
    });

    // CloudFront URL
    const stage = process.env.STAGE || "dev";
    const cloudfrontDomain =
      stage === "prod" ? "https://www.chum7.com" : "https://test.chum7.com";

    // key already starts with "uploads/", so no extra prefix needed
    const fileUrl = `${cloudfrontDomain}/${key}`;

    return response(200, {
      success: true,
      data: {
        uploadUrl,
        fileUrl,
        key,
        expiresIn: 300,
      },
    });
  } catch (error: any) {
    console.error("Generate upload URL error:", error);

    if (error instanceof z.ZodError) {
      return response(400, {
        error: "VALIDATION_ERROR",
        message: "입력값이 올바르지 않습니다",
        details: error.errors,
      });
    }

    return response(500, {
      error: "INTERNAL_SERVER_ERROR",
      message: "서버 오류가 발생했습니다",
    });
  }
};
