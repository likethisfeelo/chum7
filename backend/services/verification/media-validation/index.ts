import { S3Event } from "aws-lambda";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { evaluateVideoMetadata } from "../../../shared/lib/media-validation";

const s3Client = new S3Client({});
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function updateVerificationStatusByObjectKey(
  objectKey: string,
  status: "valid" | "invalid",
  reason?: string,
): Promise<void> {
  if (!process.env.VERIFICATIONS_TABLE) return;

  const scan = await docClient.send(
    new ScanCommand({
      TableName: process.env.VERIFICATIONS_TABLE,
      FilterExpression: "videoObjectKey = :videoObjectKey",
      ExpressionAttributeValues: {
        ":videoObjectKey": objectKey,
      },
      Limit: 1,
    }),
  );

  const item = scan.Items?.[0] as any;
  if (!item?.verificationId) return;

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.VERIFICATIONS_TABLE,
      Key: { verificationId: item.verificationId },
      UpdateExpression:
        "SET mediaValidationStatus = :status, mediaValidationReason = :reason, mediaValidatedAt = :validatedAt",
      ExpressionAttributeValues: {
        ":status": status,
        ":reason": reason || null,
        ":validatedAt": new Date().toISOString(),
      },
    }),
  );
}

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records || []) {
    if (!record.s3?.bucket?.name || !record.s3?.object?.key) continue;

    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    try {
      const head = await s3Client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      const metadata = head.Metadata || {};
      const mediaKind = metadata.mediakind || "";

      if (mediaKind !== "video") {
        console.log(
          JSON.stringify({
            eventType: "media_validation_skipped",
            bucket,
            key,
            reason: "NOT_VIDEO",
          }),
        );
        continue;
      }

      const result = evaluateVideoMetadata(metadata);
      await updateVerificationStatusByObjectKey(
        key,
        result.status,
        result.reason,
      );

      console.log(
        JSON.stringify({
          eventType: "media_validation_result",
          bucket,
          key,
          status: result.status,
          reason: result.reason || null,
          metadata: {
            trimStartSec: metadata.trimstartsec || null,
            trimEndSec: metadata.trimendsec || null,
            videoDurationSec: metadata.videodurationsec || null,
          },
        }),
      );
    } catch (error: any) {
      console.error(
        JSON.stringify({
          eventType: "media_validation_error",
          bucket,
          key,
          message: error?.message || "unknown error",
        }),
      );
    }
  }
};
