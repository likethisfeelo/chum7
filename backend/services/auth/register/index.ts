// backend/services/auth/register/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
<<<<<<< HEAD
import { CognitoIdentityProviderClient, SignUpCommand, AdminConfirmSignUpCommand } from '@aws-sdk/client-cognito-identity-provider';
=======
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand
} from '@aws-sdk/client-cognito-identity-provider';
>>>>>>> codex/fix-500-error-during-login-t38adv
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const registerSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요'),
  password: z.string()
    .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
    .regex(/[A-Z]/, '비밀번호에 대문자가 포함되어야 합니다')
    .regex(/[a-z]/, '비밀번호에 소문자가 포함되어야 합니다')
    .regex(/[0-9]/, '비밀번호에 숫자가 포함되어야 합니다'),
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다').max(50)
});

const resendConfirmationSchema = z.object({
  action: z.literal('resendConfirmation'),
  email: z.string().email('유효한 이메일 주소를 입력해주세요')
});

const confirmSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요'),
  confirmationCode: z.string().trim().length(6, '인증 코드는 6자리입니다')
});

type RegisterInput = z.infer<typeof registerSchema>;
type ConfirmInput = z.infer<typeof confirmSchema>;

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

function getRandomAnimalIcon(): string {
  const animals = ['🐰', '🐻', '🦊', '🐼', '🐸', '🦁', '🐯', '🐨', '🐵', '🐶', '🐱', '🐭'];
  return animals[Math.floor(Math.random() * animals.length)];
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');

<<<<<<< HEAD
    // 2. Cognito 사용자 생성

=======
    if (body.action === 'resendConfirmation') {
      const input = resendConfirmationSchema.parse(body);

      await cognitoClient.send(new ResendConfirmationCodeCommand({
        ClientId: process.env.USER_POOL_CLIENT_ID!,
        Username: input.email
      }));

      return response(200, {
        success: true,
        message: '인증 코드를 재발송했습니다. 이메일을 확인해주세요.'
      });
    }

    if (body.confirmationCode) {
      const input: ConfirmInput = confirmSchema.parse(body);

      await cognitoClient.send(new ConfirmSignUpCommand({
        ClientId: process.env.USER_POOL_CLIENT_ID!,
        Username: input.email,
        ConfirmationCode: input.confirmationCode
      }));

      return response(200, {
        success: true,
        message: '이메일 인증이 완료되었습니다. 로그인해주세요.'
      });
    }

    const input: RegisterInput = registerSchema.parse(body);

>>>>>>> codex/fix-500-error-during-login-t38adv
    const signUpResult = await cognitoClient.send(new SignUpCommand({
      ClientId: process.env.USER_POOL_CLIENT_ID!,
      Username: input.email,
      Password: input.password,
      UserAttributes: [
        { Name: 'email', Value: input.email },
        { Name: 'name', Value: input.name }
      ]
    }));

    const userId = signUpResult.UserSub!;

<<<<<<< HEAD
    // DEV 환경에서는 자동 확인 (실패 시에도 회원가입은 유지)
    if (process.env.STAGE === 'dev' && process.env.USER_POOL_ID) {
=======
    const shouldAutoConfirmInDev = process.env.STAGE === 'dev' && process.env.AUTO_CONFIRM_SIGNUP === 'true';
    if (shouldAutoConfirmInDev && process.env.USER_POOL_ID) {
>>>>>>> codex/fix-500-error-during-login-t38adv
      try {
        await cognitoClient.send(new AdminConfirmSignUpCommand({
          UserPoolId: process.env.USER_POOL_ID,
          Username: input.email
        }));
      } catch (confirmError) {
        console.warn('Auto confirm sign-up failed in dev stage:', confirmError);
      }
    }

<<<<<<< HEAD
    // 3. DynamoDB에 사용자 정보 저장
=======
>>>>>>> codex/fix-500-error-during-login-t38adv
    const now = new Date().toISOString();
    const user = {
      userId,
      email: input.email,
      name: input.name,
      profileImageUrl: null,
      identityPhrase: '',
      level: 1,
      exp: 0,
      animalIcon: getRandomAnimalIcon(),
      cheerTickets: 0,
      stats: {
        completedChallenges: 0,
        totalVerifications: 0,
        consecutiveDays: 0,
        averageCompletionRate: 0,
        totalCheerReceived: 0,
        totalCheerSent: 0,
        remedySuccessRate: 0
      },
      createdAt: now,
      updatedAt: now
    };

    await docClient.send(new PutCommand({
      TableName: process.env.USERS_TABLE!,
      Item: user
    }));

<<<<<<< HEAD
    // 4. 응답
=======
>>>>>>> codex/fix-500-error-during-login-t38adv
    return response(201, {
      success: true,
      message: '회원가입이 완료되었습니다',
      data: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        animalIcon: user.animalIcon,
        requiresEmailVerification: !shouldAutoConfirmInDev
      }
    });

  } catch (error: any) {
    console.error('Registration error:', error);

    if (error instanceof z.ZodError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors
      });
    }

    if (error.name === 'UsernameExistsException') {
      return response(409, {
        error: 'EMAIL_ALREADY_EXISTS',
        message: '이미 사용 중인 이메일입니다'
      });
    }

    if (error.name === 'LimitExceededException') {
      return response(429, {
        error: 'TOO_MANY_REQUESTS',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요'
      });
    }

    if (error.name === 'CodeMismatchException') {
      return response(400, {
        error: 'INVALID_CONFIRMATION_CODE',
        message: '인증 코드가 올바르지 않습니다'
      });
    }

    if (error.name === 'ExpiredCodeException') {
      return response(400, {
        error: 'EXPIRED_CONFIRMATION_CODE',
        message: '인증 코드가 만료되었습니다. 새 코드를 요청해주세요'
      });
    }

    if (error.name === 'NotAuthorizedException') {
      return response(409, {
        error: 'ALREADY_CONFIRMED',
        message: '이미 이메일 인증이 완료된 계정입니다'
      });
    }

    if (error.name === 'InvalidPasswordException') {
      return response(400, {
        error: 'INVALID_PASSWORD',
        message: '비밀번호가 정책을 만족하지 않습니다'
      });
    }

    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요'
    });
  }
};
