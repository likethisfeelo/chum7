"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const zod_1 = require("zod");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
// 입력 검증 스키마
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('유효한 이메일 주소를 입력해주세요'),
    password: zod_1.z.string()
        .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
        .regex(/[A-Z]/, '비밀번호에 대문자가 포함되어야 합니다')
        .regex(/[a-z]/, '비밀번호에 소문자가 포함되어야 합니다')
        .regex(/[0-9]/, '비밀번호에 숫자가 포함되어야 합니다'),
    name: zod_1.z.string().min(2, '이름은 최소 2자 이상이어야 합니다').max(50)
});
// 응답 헬퍼
function response(statusCode, body) {
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
function getRandomAnimalIcon() {
    const animals = ['🐰', '🐻', '🦊', '🐼', '🐸', '🦁', '🐯', '🐨', '🐵', '🐶', '🐱', '🐭'];
    return animals[Math.floor(Math.random() * animals.length)];
}
const handler = async (event) => {
    try {
        // 1. 입력 검증
        const body = JSON.parse(event.body || '{}');
        const input = registerSchema.parse(body);
        // 2. 이메일 중복 확인
        const existingUser = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.USERS_TABLE,
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': input.email
            }
        }));
        if (existingUser.Items && existingUser.Items.length > 0) {
            return response(409, {
                error: 'EMAIL_ALREADY_EXISTS',
                message: '이미 사용 중인 이메일입니다'
            });
        }
        // 3. Cognito 사용자 생성
        const signUpResult = await cognitoClient.send(new client_cognito_identity_provider_1.SignUpCommand({
            ClientId: process.env.USER_POOL_CLIENT_ID,
            Username: input.email,
            Password: input.password,
            UserAttributes: [
                { Name: 'email', Value: input.email },
                { Name: 'name', Value: input.name }
            ]
        }));
        const userId = signUpResult.UserSub;
        // DEV 환경에서는 자동 확인
        if (process.env.STAGE === 'dev') {
            await cognitoClient.send(new client_cognito_identity_provider_1.AdminConfirmSignUpCommand({
                UserPoolId: process.env.USER_POOL_ID,
                Username: input.email
            }));
        }
        // 4. DynamoDB에 사용자 정보 저장
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
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.USERS_TABLE,
            Item: user
        }));
        // 5. 응답
        return response(201, {
            success: true,
            message: '회원가입이 완료되었습니다',
            data: {
                userId: user.userId,
                email: user.email,
                name: user.name,
                animalIcon: user.animalIcon,
                requiresEmailVerification: process.env.STAGE !== 'dev'
            }
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        // Zod 검증 에러
        if (error instanceof zod_1.z.ZodError) {
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
exports.handler = handler;
