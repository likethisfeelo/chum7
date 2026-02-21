// backend/services/admin/challenge/update/index.ts
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
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
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

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return response(400, { error: 'MISSING_ID', message: '챌린지 ID가 필요합니다' });
    }

    const body = JSON.parse(event.body || '{}');
    const input = updateChallengeSchema.parse(body);

    // 챌린지 존재 확인
    const existing = await docClient.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!existing.Item) {
      return response(404, { error: 'NOT_FOUND', message: '챌린지를 찾을 수 없습니다' });
    }

    // UpdateExpression 생성
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

    return response(200, {
      success: true,
      message: '챌린지가 수정되었습니다',
    });

  } catch (error: any) {
    console.error('Update challenge error:', error);
    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', details: error.errors });
    }
    return response(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};

// backend/services/admin/challenge/delete/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient2 = new DynamoDBClient({});
const docClient2 = DynamoDBDocumentClient.from(dynamoClient2);

function response2(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function isAdmin2(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}

export const deleteHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin2(event)) {
      return response2(403, { error: 'FORBIDDEN' });
    }

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return response2(400, { error: 'MISSING_ID' });
    }

    // 참여자 확인
    const participants = await docClient2.send(new QueryCommand({
      TableName: process.env.USER_CHALLENGES_TABLE!,
      IndexName: 'challengeId-index',
      KeyConditionExpression: 'challengeId = :challengeId',
      ExpressionAttributeValues: { ':challengeId': challengeId },
      Limit: 1,
    }));

    if (participants.Items && participants.Items.length > 0) {
      return response2(400, {
        error: 'HAS_PARTICIPANTS',
        message: '참여자가 있는 챌린지는 삭제할 수 없습니다. 비활성화를 사용하세요.',
      });
    }

    // 삭제
    await docClient2.send(new DeleteCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    return response2(200, {
      success: true,
      message: '챌린지가 삭제되었습니다',
    });

  } catch (error: any) {
    console.error('Delete challenge error:', error);
    return response2(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};

// backend/services/admin/challenge/toggle/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient3 = new DynamoDBClient({});
const docClient3 = DynamoDBDocumentClient.from(dynamoClient3);

function response3(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function isAdmin3(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}

export const toggleHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin3(event)) {
      return response3(403, { error: 'FORBIDDEN' });
    }

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return response3(400, { error: 'MISSING_ID' });
    }

    // 현재 상태 조회
    const result = await docClient3.send(new GetCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
    }));

    if (!result.Item) {
      return response3(404, { error: 'NOT_FOUND' });
    }

    const newStatus = !result.Item.isActive;

    // 상태 토글
    await docClient3.send(new UpdateCommand({
      TableName: process.env.CHALLENGES_TABLE!,
      Key: { challengeId },
      UpdateExpression: 'SET isActive = :status, updatedAt = :now',
      ExpressionAttributeValues: {
        ':status': newStatus,
        ':now': new Date().toISOString(),
      },
    }));

    return response3(200, {
      success: true,
      message: `챌린지가 ${newStatus ? '활성화' : '비활성화'}되었습니다`,
      data: { isActive: newStatus },
    });

  } catch (error: any) {
    console.error('Toggle challenge error:', error);
    return response3(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};

// backend/services/admin/user/list/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient4 = new DynamoDBClient({});
const docClient4 = DynamoDBDocumentClient.from(dynamoClient4);

function response4(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function isAdmin4(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}

export const listUsersHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin4(event)) {
      return response4(403, { error: 'FORBIDDEN' });
    }

    const limit = parseInt(event.queryStringParameters?.limit || '50');
    const lastKey = event.queryStringParameters?.lastKey;

    const params: any = {
      TableName: process.env.USERS_TABLE!,
      Limit: limit,
    };

    if (lastKey) {
      params.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
    }

    const result = await docClient4.send(new ScanCommand(params));

    return response4(200, {
      success: true,
      data: {
        users: result.Items || [],
        lastKey: result.LastEvaluatedKey 
          ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
          : null,
        total: result.Count || 0,
      },
    });

  } catch (error: any) {
    console.error('List users error:', error);
    return response4(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};

// backend/services/admin/stats/overview/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient5 = new DynamoDBClient({});
const docClient5 = DynamoDBDocumentClient.from(dynamoClient5);

function response5(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function isAdmin5(event: APIGatewayProxyEvent): boolean {
  const groups = event.requestContext.authorizer?.jwt?.claims['cognito:groups'];
  if (!groups) return false;
  if (typeof groups === 'string') return groups === 'admins';
  return Array.isArray(groups) && groups.includes('admins');
}

export const statsHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAdmin5(event)) {
      return response5(403, { error: 'FORBIDDEN' });
    }

    // 병렬로 통계 조회
    const [usersResult, challengesResult, userChallengesResult] = await Promise.all([
      docClient5.send(new ScanCommand({ TableName: process.env.USERS_TABLE!, Select: 'COUNT' })),
      docClient5.send(new ScanCommand({ TableName: process.env.CHALLENGES_TABLE!, Select: 'COUNT' })),
      docClient5.send(new ScanCommand({ TableName: process.env.USER_CHALLENGES_TABLE!, Select: 'COUNT' })),
    ]);

    return response5(200, {
      success: true,
      data: {
        totalUsers: usersResult.Count || 0,
        totalChallenges: challengesResult.Count || 0,
        totalParticipations: userChallengesResult.Count || 0,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('Stats error:', error);
    return response5(500, { error: 'INTERNAL_SERVER_ERROR' });
  }
};
