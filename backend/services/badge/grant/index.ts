import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { grantBadges, GrantBadgeInput } from '../../../shared/lib/badge-grant';

const grantBadgeSchema = z.object({
  userId: z.string().min(1),
  challengeId: z.string().min(1),
  verificationId: z.string().min(1),
  day: z.number().int().min(1),
  consecutiveDays: z.number().int().min(0),
  isRemedy: z.boolean().optional().default(false),
});

type GrantBadgeRequest = z.infer<typeof grantBadgeSchema>;

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

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const authUserId = event.requestContext.authorizer?.jwt?.claims?.sub as string | undefined;
    if (!authUserId) {
      return response(401, {
        error: 'UNAUTHORIZED',
        message: '인증이 필요합니다',
      });
    }

    const body = JSON.parse(event.body || '{}');
    const input: GrantBadgeRequest = grantBadgeSchema.parse(body);

    if (input.userId !== authUserId) {
      return response(403, {
        error: 'FORBIDDEN',
        message: '본인 계정에만 뱃지를 지급할 수 있습니다',
      });
    }

    const granted = await grantBadges(input as GrantBadgeInput);

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
