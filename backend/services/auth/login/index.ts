// backend/services/auth/login/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const forgotPasswordSchema = z.object({
  action: z.literal('forgotPassword'),
  email: z.string().email()
});

const confirmForgotPasswordSchema = z.object({
  action: z.literal('confirmForgotPassword'),
  email: z.string().email(),
  confirmationCode: z.string().trim().length(6, '인증 코드는 6자리입니다'),
  newPassword: z.string()
    .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
    .regex(/[A-Z]/, '비밀번호에 대문자가 포함되어야 합니다')
    .regex(/[a-z]/, '비밀번호에 소문자가 포함되어야 합니다')
    .regex(/[0-9]/, '비밀번호에 숫자가 포함되어야 합니다')
});

type LoginInput = z.infer<typeof loginSchema>;

type IdTokenPayload = {
  sub?: string;
  email_verified?: boolean | string;
};

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

function parseIdTokenPayload(idToken?: string): IdTokenPayload | null {
  if (!idToken) return null;

  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decodedPayload = Buffer.from(normalizedPayload, 'base64').toString('utf8');
    return JSON.parse(decodedPayload) as IdTokenPayload;
  } catch (error) {
    console.error('Failed to parse Cognito idToken payload:', error);
    return null;
  }
}

function isEmailVerified(payload: IdTokenPayload | null): boolean {
  if (!payload) return false;
  return payload.email_verified === true || payload.email_verified === 'true';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');

    if (body.action === 'forgotPassword') {
      const input = forgotPasswordSchema.parse(body);

      await cognitoClient.send(new ForgotPasswordCommand({
        ClientId: process.env.USER_POOL_CLIENT_ID!,
        Username: input.email
      }));

      return response(200, {
        success: true,
        message: '비밀번호 재설정 인증 코드를 이메일로 발송했습니다'
      });
    }

    if (body.action === 'confirmForgotPassword') {
      const input = confirmForgotPasswordSchema.parse(body);

      await cognitoClient.send(new ConfirmForgotPasswordCommand({
        ClientId: process.env.USER_POOL_CLIENT_ID!,
        Username: input.email,
        ConfirmationCode: input.confirmationCode,
        Password: input.newPassword
      }));

      return response(200, {
        success: true,
        message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.'
      });
    }

    const input: LoginInput = loginSchema.parse(body);

    const authResult = await cognitoClient.send(new InitiateAuthCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID!,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: input.email,
        PASSWORD: input.password
      }
    }));

    if (!authResult.AuthenticationResult) {
      return response(401, { error: 'AUTHENTICATION_FAILED', message: '로그인에 실패했습니다' });
    }

    const idToken = authResult.AuthenticationResult.IdToken;
    const tokenPayload = parseIdTokenPayload(idToken);
    const userId = tokenPayload?.sub;

    if (!userId) {
      return response(500, { error: 'INVALID_IDENTITY_TOKEN', message: '사용자 식별 정보 확인에 실패했습니다' });
    }

    if (!isEmailVerified(tokenPayload)) {
      return response(403, {
        error: 'EMAIL_NOT_VERIFIED',
        message: '이메일 인증이 완료되지 않았습니다. 메일함에서 인증을 완료해주세요',
        data: { email: input.email, needsEmailVerification: true }
      });
    }

    const userResult = await docClient.send(new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId }
    }));

    if (!userResult.Item) {
      return response(409, {
        error: 'USER_PROFILE_NOT_READY',
        message: '계정 정보 동기화가 필요합니다. 다시 회원가입을 진행해주세요'
      });
    }

    const user = userResult.Item;

    return response(200, {
      success: true,
      message: '로그인 성공',
      data: {
        tokens: {
          accessToken: authResult.AuthenticationResult.AccessToken,
          refreshToken: authResult.AuthenticationResult.RefreshToken,
          idToken,
          expiresIn: authResult.AuthenticationResult.ExpiresIn
        },
        user: {
          userId: user.userId,
          email: user.email,
          name: user.name,
          profileImageUrl: user.profileImageUrl,
          animalIcon: user.animalIcon,
          level: user.level,
          exp: user.exp,
          cheerTickets: user.cheerTickets
        }
      }
    });

  } catch (error: any) {
    console.error('Login error:', error);

    if (error instanceof z.ZodError) {
      return response(400, { error: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다', details: error.errors });
    }

    if (error.name === 'NotAuthorizedException') {
      return response(401, { error: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    if (error.name === 'UserNotConfirmedException') {
      return response(403, {
        error: 'USER_NOT_CONFIRMED',
        message: '이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요',
        data: { needsEmailVerification: true }
      });
    }

    if (error.name === 'UserNotFoundException') {
      return response(404, { error: 'USER_NOT_FOUND', message: '존재하지 않는 사용자입니다' });
    }

    if (error.name === 'CodeMismatchException') {
      return response(400, { error: 'INVALID_CONFIRMATION_CODE', message: '인증 코드가 올바르지 않습니다' });
    }

    if (error.name === 'ExpiredCodeException') {
      return response(400, { error: 'EXPIRED_CONFIRMATION_CODE', message: '인증 코드가 만료되었습니다. 새 코드를 요청해주세요' });
    }

    if (error.name === 'LimitExceededException') {
      return response(429, { error: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요' });
    }

    return response(500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' });
  }
};
