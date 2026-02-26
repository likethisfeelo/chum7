// backend/services/auth/register/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, SignUpCommand, AdminConfirmSignUpCommand } from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});

// 입력 검증 스키마
const registerSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요'),
  password: z.string()
    .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
    .regex(/[A-Z]/, '비밀번호에 대문자가 포함되어야 합니다')
    .regex(/[a-z]/, '비밀번호에 소문자가 포함되어야 합니다')
    .regex(/[0-9]/, '비밀번호에 숫자가 포함되어야 합니다'),
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다').max(50)
});

type RegisterInput = z.infer<typeof registerSchema>;

// 응답 헬퍼
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

// 동물 아이콘 랜덤 선택
function getRandomAnimalIcon(): string {
  const animals = ['🐰', '🐻', '🦊', '🐼', '🐸', '🦁', '🐯', '🐨', '🐵', '🐶', '🐱', '🐭'];
  return animals[Math.floor(Math.random() * animals.length)];
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. 입력 검증
    const body = JSON.parse(event.body || '{}');
    const input: RegisterInput = registerSchema.parse(body);

    // 2. Cognito 사용자 생성

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

    // 자동 확인은 명시적으로 활성화된 경우에만 수행
    const shouldAutoConfirmInDev = process.env.STAGE === 'dev' && process.env.AUTO_CONFIRM_SIGNUP === 'true';
    if (shouldAutoConfirmInDev && process.env.USER_POOL_ID) {
      try {
        await cognitoClient.send(new AdminConfirmSignUpCommand({
          UserPoolId: process.env.USER_POOL_ID,
          Username: input.email
        }));
      } catch (confirmError) {
        console.warn('Auto confirm sign-up failed in dev stage:', confirmError);
      }
    }

    // 3. DynamoDB에 사용자 정보 저장
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

    // 4. 응답
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

    // Zod 검증 에러
    if (error instanceof z.ZodError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다',
        details: error.errors
      });
    }

    // Cognito 에러
    if (error.name === 'UsernameExistsException') {
      return response(409, {
        error: 'EMAIL_ALREADY_EXISTS',
        message: '이미 사용 중인 이메일입니다'
      });
    }

    if (error.name === 'InvalidPasswordException') {
      return response(400, {
        error: 'INVALID_PASSWORD',
        message: '비밀번호가 정책을 만족하지 않습니다'
      });
    }

    // 일반 에러
    return response(500, {
      error: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요'
    });
  }
};