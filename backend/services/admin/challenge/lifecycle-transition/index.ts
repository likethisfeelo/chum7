import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

type Lifecycle = 'draft' | 'recruiting' | 'preparing' | 'active' | 'completed' | 'archived';

// 허용된 수동 전환 경로 (자동 전환은 lifecycle-manager Lambda가 담당)
const ALLOWED_TRANSITIONS: Record<Lifecycle, Lifecycle[]> = {
  draft:      ['recruiting', 'archived'],
  recruiting: ['preparing', 'archived'],
  preparing:  ['active', 'archived'],
  active:     ['completed', 'archived'],
  completed:  ['archived'],
  archived:   [],
};

const transitionSchema = z.object({
  lifecycle: z.enum(['draft', 'recruiting', 'preparing', 'active', 'completed', 'archived']),
  reason: z.string().max(200).optional(),
});

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function parseGroups(rawGroups: unknown): string[] {
  if (!rawGroups) return [];

  if (Array.isArray(rawGroups)) {
    return rawGroups.map(String).map(g => g.trim()).filter(Boolean);
  }

  if (typeof rawGroups !== 'string') {
    return [];
  }

  const value = rawGroups.trim();
  if (!value) return [];

  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map(g => g.trim()).filter(Boolean);
      }
    } catch {
      // fall through to delimiter parsing
    }
  }

  return value
    .split(/[,:]/)
    .map(g => g.replace(/[\[\]"']/g, '').trim())
    .filter(Boolean);
}

function canTransitionByGroup(event: APIGatewayProxyEvent): boolean {
  const groupsRaw = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  const groups = parseGroups(groupsRaw);
  return groups.some(group => ['admins', 'productowners'].includes(group));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return response(400, { error: 'MISSING_ID', message: '챌린지 ID가 필요합니다' });
    }

    const body = JSON.parse(event.body || '{}');
    const input = transitionSchema.parse(body);

    const existing = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!existing.Item) {
      return response(404, { error: 'NOT_FOUND', message: '챌린지를 찾을 수 없습니다' });
    }

    const requesterId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    const isCreator = existing.Item.createdBy && existing.Item.createdBy === requesterId;

    if (!canTransitionByGroup(event) && !isCreator) {
      return response(403, { error: 'FORBIDDEN', message: '챌린지 상태 변경 권한이 없습니다' });
    }

    const currentLifecycle = existing.Item.lifecycle as Lifecycle;
    const targetLifecycle = input.lifecycle;

    if (!ALLOWED_TRANSITIONS[currentLifecycle].includes(targetLifecycle)) {
      return response(409, {
        error: 'INVALID_TRANSITION',
        message: `${currentLifecycle} → ${targetLifecycle} 전환은 허용되지 않습니다`,
        allowedTransitions: ALLOWED_TRANSITIONS[currentLifecycle],
      });
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: 'SET lifecycle = :lifecycle, updatedAt = :now',
      ExpressionAttributeValues: {
        ':lifecycle': targetLifecycle,
        ':now': new Date().toISOString(),
      },
    }));

    return response(200, {
      success: true,
      message: `챌린지 상태가 변경되었습니다: ${currentLifecycle} → ${targetLifecycle}`,
      data: { previousLifecycle: currentLifecycle, lifecycle: targetLifecycle },
    });

  } catch (error: any) {
    console.error('Lifecycle transition error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
