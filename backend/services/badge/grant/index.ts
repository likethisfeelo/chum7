import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { evaluateBadgeIds } from '../../../shared/lib/badge';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const BADGES_TABLE = process.env.BADGES_TABLE!;

const grantBadgeSchema = z.object({
  userId: z.string().min(1),
  challengeId: z.string().min(1),
  verificationId: z.string().min(1),
  day: z.number().int().min(1),
  consecutiveDays: z.number().int().min(0),
  isRemedy: z.boolean().optional().default(false),
});

type GrantBadgeInput = z.infer<typeof grantBadgeSchema>;

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

export async function grantBadges(input: GrantBadgeInput): Promise<string[]> {
  if (!BADGES_TABLE) return [];

  const badgeIds = evaluateBadgeIds(input);
  const grantedAt = new Date().toISOString();
  const granted: string[] = [];

  for (const badgeId of badgeIds) {
    try {
      await docClient.send(new PutCommand({
        TableName: BADGES_TABLE,
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
      }));
      granted.push(badgeId);
    } catch (error: any) {
      if (error?.name !== 'ConditionalCheckFailedException') {
        console.error('[badge-grant] failed to grant badge', { badgeId, userId: input.userId, error });
      }
    }
  }

  return granted;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const input = grantBadgeSchema.parse(body);
    const granted = await grantBadges(input);

    return response(200, {
      success: true,
      data: {
        newBadges: granted,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors,
      });
    }

    console.error('[badge-grant] error', error);
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다',
    });
  }
};
