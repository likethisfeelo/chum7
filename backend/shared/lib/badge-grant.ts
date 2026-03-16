import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { evaluateBadgeIds } from './badge';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export type GrantBadgeInput = {
  userId: string;
  challengeId: string;
  verificationId: string;
  day: number;
  consecutiveDays: number;
  isRemedy?: boolean;
};

export type GrantSpecificBadgeInput = {
  badgeId: string;
  userId: string;
  challengeId: string;
  metadata?: Record<string, any>;
};

export async function grantSpecificBadge(input: GrantSpecificBadgeInput): Promise<boolean> {
  const badgesTable = process.env.BADGES_TABLE;
  if (!badgesTable) return false;

  const grantedAt = new Date().toISOString();
  try {
    await docClient.send(
      new PutCommand({
        TableName: badgesTable,
        Item: {
          badgeId: input.badgeId,
          userId: input.userId,
          challengeId: input.challengeId,
          grantedAt,
          createdAt: grantedAt,
          ...input.metadata,
        },
        ConditionExpression: 'attribute_not_exists(badgeId) AND attribute_not_exists(userId)',
      }),
    );
    return true;
  } catch (error: any) {
    if (error?.name !== 'ConditionalCheckFailedException') {
      console.error('[badge-grant] failed to grant specific badge', {
        badgeId: input.badgeId,
        userId: input.userId,
        error,
      });
    }
    return false;
  }
}

export async function grantBadges(input: GrantBadgeInput): Promise<string[]> {
  const badgesTable = process.env.BADGES_TABLE;
  if (!badgesTable) return [];

  const badgeIds = evaluateBadgeIds(input);
  const grantedAt = new Date().toISOString();
  const granted: string[] = [];

  for (const badgeId of badgeIds) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: badgesTable,
          Item: {
            badgeId,
            userId: input.userId,
            challengeId: input.challengeId,
            verificationId: input.verificationId,
            grantedAt,
            sourceDay: input.day,
            sourceConsecutiveDays: input.consecutiveDays,
            createdAt: grantedAt,
          },
          ConditionExpression: 'attribute_not_exists(badgeId) AND attribute_not_exists(userId)',
        }),
      );
      granted.push(badgeId);
    } catch (error: any) {
      if (error?.name !== 'ConditionalCheckFailedException') {
        console.error('[badge-grant] failed to grant badge', {
          badgeId,
          userId: input.userId,
          error,
        });
      }
    }
  }

  return granted;
}
