import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const createChallengeSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  category: z.enum(['health', 'habit', 'development', 'creativity', 'relationship', 'mindfulness']),
  targetTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
  identityKeyword: z.string().min(1).max(50),
  badgeIcon: z.string().min(1).max(10),
  badgeName: z.string().min(1).max(50),
});

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

    const body = JSON.parse(event.body || '{}');
    const input = createChallengeSchema.parse(body);

    const challengeId = uuidv4();
    const now = new Date().toISOString();

    const challenge = {
      challengeId,
      title: input.title,
      description: input.description,
      category: input.category,
      targetTime: input.targetTime,
      identityKeyword: input.identityKeyword,
      badgeIcon: input.badgeIcon,
      badgeName: input.badgeName,
      stats: {
        totalParticipants: 0,
        activeParticipants: 0,
        completionRate: 0,
        averageDelta: 0,
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: event.requestContext.authorizer?.jwt?.claims?.sub || 'admin',
    };

    await docClient.send(new PutCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Item: challenge,
    }));

    return response(201, {
      success: true,
      message: '챌린지가 생성되었습니다',
      data: challenge,
    });

  } catch (error: any) {
    console.error('Create challenge error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
