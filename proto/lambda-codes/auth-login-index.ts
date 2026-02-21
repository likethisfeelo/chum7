// backend/services/auth/login/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type LoginInput = z.infer<typeof loginSchema>;

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
    const input: LoginInput = loginSchema.parse(body);

    // 1. Cognito 인증
    const authResult = await cognitoClient.send(new InitiateAuthCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID!,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: input.email,
        PASSWORD: input.password
      }
    }));

    if (!authResult.AuthenticationResult) {
      return response(401, {
        error: 'AUTHENTICATION_FAILED',
        message: '로그인에 실패했습니다'
      });
    }

    // 2. DynamoDB에서 사용자 정보 조회
    const userResult = await docClient.send(new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': input.email
      }
    }));

    if (!userResult.Items || userResult.Items.length === 0) {
      return response(404, {
        error: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다'
      });
    }

    const user = userResult.Items[0];

    // 3. 토큰 및 사용자 정보 반환
    return response(200, {
      success: true,
      message: '로그인 성공',
      data: {
        tokens: {
          accessToken: authResult.AuthenticationResult.AccessToken,
          refreshToken: authResult.AuthenticationResult.RefreshToken,
          idToken: authResult.AuthenticationResult.IdToken,
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
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors
      });
    }

    if (error.name === 'NotAuthorizedException') {
      return response(401, {
        error: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호가 올바르지 않습니다'
      });
    }

    if (error.name === 'UserNotFoundException') {
      return response(404, {
        error: 'USER_NOT_FOUND',
        message: '존재하지 않는 사용자입니다'
      });
    }

    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    });
  }
};
