import { EventBridgeEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { resolvePlazaFallbackContent } from '../../../shared/lib/plaza-convert-content';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));


function conversionCursorWindowUtc() {
  const now = new Date();
  const end = now.toISOString();
  const start = "1970-01-01T00:00:00.000Z";
  return {
    startIso: start,
    endIso: end,
    convertedAt: now.toISOString(),
  };
}

export const handler = async (_event: EventBridgeEvent<string, unknown>) => {
  const verificationsTable = process.env.VERIFICATIONS_TABLE!;
  const plazaPostsTable = process.env.PLAZA_POSTS_TABLE!;

  const { startIso, endIso, convertedAt } = conversionCursorWindowUtc();
  let lastEvaluatedKey: Record<string, any> | undefined;

  let scannedCount = 0;
  let convertedCount = 0;
  let skipTypeCount = 0;
  let skipNoTodayNoteCount = 0; // legacy metric field kept for dashboard compatibility (always 0 with fallback content)
  let fallbackFromTomorrowPromiseCount = 0;
  let fallbackGeneratedDayCount = 0;
  let fallbackGeneratedDefaultCount = 0;
  let skipAlreadyConvertedCount = 0;
  let conditionalDuplicateCount = 0;
  let pageCount = 0;

  try {
    do {
      const page = await ddb.send(new QueryCommand({
        TableName: verificationsTable,
        IndexName: 'isPublic-createdAt-index',
        KeyConditionExpression: 'isPublic = :isPublic',
        ExpressionAttributeValues: {
          ':isPublic': 'true',
        },
        ExclusiveStartKey: lastEvaluatedKey,
        Limit: 100,
      }));

      pageCount += 1;

      for (const item of page.Items || []) {
        scannedCount += 1;

        if (item.type !== 'normal') {
          skipTypeCount += 1;
          continue;
        }
        if (item.isConvertedToPlaza === true) {
          skipAlreadyConvertedCount += 1;
          continue;
        }
        const fallback = resolvePlazaFallbackContent(item);
        const fallbackContent = fallback.content;
        if (fallback.source === 'tomorrowPromise') fallbackFromTomorrowPromiseCount += 1;
        if (fallback.source === 'generatedDay') fallbackGeneratedDayCount += 1;
        if (fallback.source === 'generatedDefault') fallbackGeneratedDefaultCount += 1;

        const plazaPostId = `courtyard-${item.verificationId}`;

        await ddb.send(new PutCommand({
          TableName: plazaPostsTable,
          Item: {
            plazaPostId,
            postType: 'courtyard',
            challengeTitle: item.challengeTitle || '챌린지 기록',
            challengeCategory: item.challengeCategory || null,
            currentDay: item.day || null,
            imageUrl: item.imageUrl || item.videoUrl || null,
            content: fallbackContent,
            leaderId: null,
            leaderName: null,
            leaderMessage: null,
            recruitmentData: null,
            sourceType: 'verification',
            sourceId: item.verificationId,
            sourceChallengeId: item.challengeId || undefined,
            sourceLeaderId: item.leaderId || undefined,
            sourceUserId: item.userId || null,
            likeCount: Number(item.likeCount || 0),
            commentCount: 0,
            bookmarkCount: 0,
            isActive: true,
            createdAt: item.createdAt || convertedAt,
            originalCreatedAt: item.createdAt || null,
            convertedAt,
          },
          ConditionExpression: 'attribute_not_exists(plazaPostId)',
        })).catch((error: any) => {
          if (error?.name !== 'ConditionalCheckFailedException') throw error;
          conditionalDuplicateCount += 1;
        });

        await ddb.send(new UpdateCommand({
          TableName: verificationsTable,
          Key: { verificationId: item.verificationId },
          UpdateExpression: 'SET isConvertedToPlaza = :done, convertedToPlazaAt = :convertedAt',
          ExpressionAttributeValues: {
            ':done': true,
            ':convertedAt': convertedAt,
          },
        }));

        convertedCount += 1;
      }

      lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(JSON.stringify({
      eventType: 'plaza_convert_summary',
      level: 'INFO',
      windowStart: startIso,
      windowEnd: endIso,
      pageCount,
      scannedCount,
      convertedCount,
      skipTypeCount,
      skipNoTodayNoteCount,
      fallbackFromTomorrowPromiseCount,
      fallbackGeneratedDayCount,
      fallbackGeneratedDefaultCount,
      skipAlreadyConvertedCount,
      conditionalDuplicateCount,
    }));

    return {
      success: true,
      converted: convertedCount,
      window: {
        startIso,
        endIso,
      },
    };
  } catch (error: any) {
    console.error(JSON.stringify({
      eventType: 'plaza_convert_failure',
      level: 'ERROR',
      message: error?.message || 'unknown error',
      windowStart: startIso,
      windowEnd: endIso,
      pageCount,
      scannedCount,
      convertedCount,
      skipTypeCount,
      skipNoTodayNoteCount,
      fallbackFromTomorrowPromiseCount,
      fallbackGeneratedDayCount,
      fallbackGeneratedDefaultCount,
      skipAlreadyConvertedCount,
      conditionalDuplicateCount,
    }));
    throw error;
  }
};
