import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient } from '../../../shared/lib/dynamodb-client';
import { response } from '../../../shared/lib/api-response';

const schema = z.object({
  mythology: z.enum(['korean', 'greek', 'norse']).nullable(),
});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub as string;
    if (!userId) return response(401, { error: 'UNAUTHORIZED' });

    const body = JSON.parse(event.body || '{}');
    const parsed = schema.safeParse(body);
    if (!parsed.success) return response(400, { error: 'INVALID_INPUT' });

    const { mythology } = parsed.data;

    // null 이면 themeOverride 초기화 (세계관 검증 불필요)
    if (mythology !== null) {
      const userRes = await docClient.send(new GetCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId },
        ProjectionExpression: 'completedMythologies',
      }));
      const completedMythologies: string[] = userRes.Item?.completedMythologies ?? [];

      if (!completedMythologies.includes(mythology)) {
        return response(403, {
          error: 'MYTHOLOGY_NOT_COMPLETED',
          message: '완성한 세계관만 테마로 적용할 수 있어요',
        });
      }
    }

    await docClient.send(new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      UpdateExpression: 'SET themeOverride = :theme, updatedAt = :now',
      ExpressionAttributeValues: {
        ':theme': mythology,
        ':now': new Date().toISOString(),
      },
    }));

    return response(200, { success: true, data: { themeOverride: mythology } });
  } catch (err) {
    console.error('[character/theme] error:', err);
    return response(500, { error: 'INTERNAL_ERROR' });
  }
};
