/**
 * Challenge Update (creator only)
 *
 * PATCH /challenges/{challengeId}
 * 수정 가능 상태: draft, recruiting
 * 수정 가능 필드: title, description, targetTime, badgeIcon, badgeName, identityKeyword,
 *                recruitingEndAt, challengeStartAt, maxParticipants
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function res(statusCode: number, body: unknown): APIGatewayProxyResult {
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

const updateSchema = z.object({
  title: z.string().min(2).max(60).optional(),
  description: z.string().min(10).max(2000).optional(),
  targetTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  badgeIcon: z.string().max(10).optional(),
  badgeName: z.string().min(1).max(30).optional(),
  identityKeyword: z.string().min(1).max(30).optional(),
  recruitingEndAt: z.string().datetime().optional(),
  challengeStartAt: z.string().datetime().optional(),
  maxParticipants: z.number().int().min(1).max(1000).nullable().optional(),
});

const EDITABLE_LIFECYCLES = ['draft', 'recruiting'];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return res(401, { error: 'UNAUTHORIZED' });

    const { challengeId } = event.pathParameters ?? {};
    if (!challengeId) return res(400, { error: 'MISSING_CHALLENGE_ID' });

    const parsed = updateSchema.safeParse(JSON.parse(event.body || '{}'));
    if (!parsed.success) {
      return res(400, { error: 'VALIDATION_ERROR', details: parsed.error.errors });
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return res(400, { error: 'NO_FIELDS', message: '수정할 항목을 하나 이상 입력해주세요' });
    }

    const challengeRes = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      ProjectionExpression: 'challengeId, createdBy, lifecycle',
    }));

    const challenge = challengeRes.Item;
    if (!challenge) return res(404, { error: 'CHALLENGE_NOT_FOUND' });
    if (challenge.createdBy !== userId) return res(403, { error: 'FORBIDDEN' });
    if (!EDITABLE_LIFECYCLES.includes(challenge.lifecycle)) {
      return res(409, {
        error: 'NOT_EDITABLE',
        message: `${challenge.lifecycle} 상태에서는 수정할 수 없어요 (draft, recruiting 상태만 가능)`,
      });
    }

    const now = new Date().toISOString();
    const setExpressions: string[] = ['updatedAt = :now'];
    const exprValues: Record<string, unknown> = { ':now': now };

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      targetTime: 'targetTime',
      badgeIcon: 'badgeIcon',
      badgeName: 'badgeName',
      identityKeyword: 'identityKeyword',
      recruitingEndAt: 'recruitingEndAt',
      challengeStartAt: 'challengeStartAt',
      maxParticipants: 'maxParticipants',
    };

    for (const [key, dbKey] of Object.entries(fieldMap)) {
      const value = (updates as Record<string, unknown>)[key];
      if (value === undefined) continue;
      if (value === null) {
        setExpressions.push(`${dbKey} = :null_${key}`);
        exprValues[`:null_${key}`] = null;
      } else {
        setExpressions.push(`${dbKey} = :${key}`);
        exprValues[`:${key}`] = value;
      }
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeValues: exprValues,
    }));

    return res(200, {
      success: true,
      message: '챌린지가 수정됐어요',
      data: { challengeId },
    });
  } catch (err: any) {
    console.error('[challenge/update] error:', err);
    return res(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
