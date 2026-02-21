import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const updateChallengeSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(10).max(1000).optional(),
  category: z.enum(['health', 'habit', 'development', 'creativity', 'relationship', 'mindfulness']).optional(),
  targetTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  identityKeyword: z.string().min(1).max(50).optional(),
  badgeIcon: z.string().min(1).max(10).optional(),
  badgeName: z.string().min(1).max(50).optional(),
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin(event)) {
      return response(403, { error: 'FORBIDDEN', message: '관리자 권한이 필요합니다' });
    }

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return response(400, { error: 'MISSING_ID', message: '챌린지 ID가 필요합니다' });
    }

    const body = JSON.parse(event.body || '{}');
    const input = updateChallengeSchema.parse(body);

    const existing = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!existing.Item) {
      return response(404, { error: 'NOT_FOUND', message: '챌린지를 찾을 수 없습니다' });
    }

    const updates: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`#${key} = :${key}`);
        names[`#${key}`] = key;
        values[`:${key}`] = value;
      }
    });

    updates.push('updatedAt = :updatedAt');
    values[':updatedAt'] = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));

    return response(200, { success: true, message: '챌린지가 수정되었습니다' });

  } catch (error: any) {
    console.error('Update challenge error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
