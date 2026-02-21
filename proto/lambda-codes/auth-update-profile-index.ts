// backend/services/auth/update-profile/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  profileImageUrl: z.string().url().optional().nullable(),
  identityPhrase: z.string().max(100).optional()
});

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(body)
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub || event.queryStringParameters?.userId;

    if (!userId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다'
      });
    }

    const body = JSON.parse(event.body || '{}');
    const input: UpdateProfileInput = updateProfileSchema.parse(body);

    // 업데이트할 필드가 있는지 확인
    if (Object.keys(input).length === 0) {
      return response(400, {
        error: 'NO_UPDATE_FIELDS',
        message: '업데이트할 항목이 없습니다'
      });
    }

    // UpdateExpression 동적 생성
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (input.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = input.name;
    }

    if (input.profileImageUrl !== undefined) {
      updateExpressions.push('profileImageUrl = :profileImageUrl');
      expressionAttributeValues[':profileImageUrl'] = input.profileImageUrl;
    }

    if (input.identityPhrase !== undefined) {
      updateExpressions.push('identityPhrase = :identityPhrase');
      expressionAttributeValues[':identityPhrase'] = input.identityPhrase;
    }

    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    await docClient.send(new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 
        ? expressionAttributeNames 
        : undefined,
      ExpressionAttributeValues: expressionAttributeValues
    }));

    // 업데이트된 사용자 정보 조회
    const result = await docClient.send(new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId }
    }));

    return response(200, {
      success: true,
      message: '프로필이 업데이트되었습니다',
      data: result.Item
    });

  } catch (error: any) {
    console.error('Update profile error:', error);

    if (error instanceof z.ZodError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors
      });
    }

    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
