// backend/services/auth/refresh-token/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';

const cognitoClient = new CognitoIdentityProviderClient({});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

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
    const body = JSON.parse(event.body || '{}');
    const input = refreshSchema.parse(body);

    const authResult = await cognitoClient.send(new InitiateAuthCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID!,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: input.refreshToken
      }
    }));

    if (!authResult.AuthenticationResult) {
      return response(401, {
        error: 'REFRESH_FAILED',
        message: '토큰 갱신에 실패했습니다'
      });
    }

    return response(200, {
      success: true,
      data: {
        accessToken: authResult.AuthenticationResult.AccessToken,
        idToken: authResult.AuthenticationResult.IdToken,
        expiresIn: authResult.AuthenticationResult.ExpiresIn
      }
    });

  } catch (error: any) {
    console.error('Refresh token error:', error);

    if (error.name === 'NotAuthorizedException') {
      return response(401, {
        error: 'INVALID_REFRESH_TOKEN',
        message: '유효하지 않은 리프레시 토큰입니다'
      });
    }

    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
