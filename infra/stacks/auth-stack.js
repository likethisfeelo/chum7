"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_1 = require("aws-cdk-lib/aws-apigatewayv2");
const aws_apigatewayv2_integrations_1 = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const aws_iam_1 = require("aws-cdk-lib/aws-iam");
const path = __importStar(require("path"));
class AuthStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, apiGateway, authorizer, userPool, userPoolClient, usersTable } = props;
        const commonEnv = {
            STAGE: stage,
            USERS_TABLE: usersTable.tableName,
            USER_POOL_ID: userPool.userPoolId,
            USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        };
        const commonProps = {
            runtime: aws_lambda_1.Runtime.NODEJS_20_X,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 256,
            bundling: {
                minify: true,
                sourceMap: stage === 'dev',
                externalModules: ['@aws-sdk/*'],
            },
        };
        // 1. Register (public)
        const registerFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'RegisterFn', {
            ...commonProps,
            functionName: `chme-${stage}-auth-register`,
            entry: path.join(__dirname, '../../backend/services/auth/register/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        usersTable.grantWriteData(registerFn);
        // dev에서 자동 이메일 인증 확인을 위한 Cognito 권한
        registerFn.addToRolePolicy(new aws_iam_1.PolicyStatement({
            actions: ['cognito-idp:AdminConfirmSignUp'],
            resources: [userPool.userPoolArn],
        }));
        apiGateway.addRoutes({
            path: '/auth/register',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('RegisterIntegration', registerFn),
        });
        // 2. Login (public)
        const loginFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'LoginFn', {
            ...commonProps,
            functionName: `chme-${stage}-auth-login`,
            entry: path.join(__dirname, '../../backend/services/auth/login/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        usersTable.grantReadData(loginFn);
        apiGateway.addRoutes({
            path: '/auth/login',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('LoginIntegration', loginFn),
        });
        // 3. Refresh Token (public)
        const refreshFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'RefreshFn', {
            ...commonProps,
            functionName: `chme-${stage}-auth-refresh-token`,
            entry: path.join(__dirname, '../../backend/services/auth/refresh-token/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        apiGateway.addRoutes({
            path: '/auth/refresh',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('RefreshIntegration', refreshFn),
        });
        // 4. Get Profile (protected)
        const getProfileFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'GetProfileFn', {
            ...commonProps,
            functionName: `chme-${stage}-auth-get-profile`,
            entry: path.join(__dirname, '../../backend/services/auth/get-profile/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        usersTable.grantReadData(getProfileFn);
        apiGateway.addRoutes({
            path: '/auth/me',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('GetProfileIntegration', getProfileFn),
            authorizer,
        });
        // 5. Update Profile (protected)
        const updateProfileFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'UpdateProfileFn', {
            ...commonProps,
            functionName: `chme-${stage}-auth-update-profile`,
            entry: path.join(__dirname, '../../backend/services/auth/update-profile/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        usersTable.grantReadWriteData(updateProfileFn);
        apiGateway.addRoutes({
            path: '/auth/me',
            methods: [aws_apigatewayv2_1.HttpMethod.PUT],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('UpdateProfileIntegration', updateProfileFn),
            authorizer,
        });
    }
}
exports.AuthStack = AuthStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSw2Q0FBMEQ7QUFFMUQsbUVBQW1FO0FBRW5FLDZGQUFrRjtBQUNsRixxRUFBK0Q7QUFDL0QsdURBQWlEO0FBQ2pELGlEQUFzRDtBQUd0RCwyQ0FBNkI7QUFXN0IsTUFBYSxTQUFVLFNBQVEsbUJBQUs7SUFDbEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFxQjtRQUM3RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFdEYsTUFBTSxTQUFTLEdBQUc7WUFDaEIsS0FBSyxFQUFFLEtBQUs7WUFDWixXQUFXLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDakMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxVQUFVO1lBQ2pDLG1CQUFtQixFQUFFLGNBQWMsQ0FBQyxnQkFBZ0I7U0FDckQsQ0FBQztRQUVGLE1BQU0sV0FBVyxHQUFHO1lBQ2xCLE9BQU8sRUFBRSxvQkFBTyxDQUFDLFdBQVc7WUFDNUIsT0FBTyxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM3QixVQUFVLEVBQUUsR0FBRztZQUNmLFFBQVEsRUFBRTtnQkFDUixNQUFNLEVBQUUsSUFBSTtnQkFDWixTQUFTLEVBQUUsS0FBSyxLQUFLLEtBQUs7Z0JBQzFCLGVBQWUsRUFBRSxDQUFDLFlBQVksQ0FBQzthQUNoQztTQUNGLENBQUM7UUFFRix1QkFBdUI7UUFDdkIsTUFBTSxVQUFVLEdBQUcsSUFBSSxrQ0FBYyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDeEQsR0FBRyxXQUFXO1lBQ2Qs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QUFjLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ2xFLEdBQUcsV0FBVztZQUNkLFlBQVksRUFBRSxRQUFRLEtBQUssc0JBQXNCO1lBQ2pELEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxxREFBcUQsQ0FBQztZQUNsRixPQUFPLEVBQUUsU0FBUztZQUNsQixXQUFXLEVBQUUsU0FBUztTQUN2QixDQUFDLENBQUM7UUFDSCxVQUFVLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDL0MsVUFBVSxDQUFDLFNBQVMsQ0FBQztZQUNuQixJQUFJLEVBQUUsVUFBVTtZQUNoQixPQUFPLEVBQUUsQ0FBQyw2QkFBVSxDQUFDLEdBQUcsQ0FBQztZQUN6QixXQUFXLEVBQUUsSUFBSSxxREFBcUIsQ0FBQywwQkFBMEIsRUFBRSxlQUFlLENBQUM7WUFDbkYsVUFBVTtTQUNYLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXpHRCw4QkF5R0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgRHVyYXRpb24gfSBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgeyBIdHRwQXBpLCBIdHRwTWV0aG9kIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mic7XHJcbmltcG9ydCB7IEh0dHBKd3RBdXRob3JpemVyIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mi1hdXRob3JpemVycyc7XHJcbmltcG9ydCB7IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5djItaW50ZWdyYXRpb25zJztcclxuaW1wb3J0IHsgTm9kZWpzRnVuY3Rpb24gfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XHJcbmltcG9ydCB7IFJ1bnRpbWUgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgUG9saWN5U3RhdGVtZW50IH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcbmltcG9ydCB7IFRhYmxlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0IHsgVXNlclBvb2wsIFVzZXJQb29sQ2xpZW50IH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuaW50ZXJmYWNlIEF1dGhTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XHJcbiAgc3RhZ2U6IHN0cmluZztcclxuICBhcGlHYXRld2F5OiBIdHRwQXBpO1xyXG4gIGF1dGhvcml6ZXI6IEh0dHBKd3RBdXRob3JpemVyO1xyXG4gIHVzZXJQb29sOiBVc2VyUG9vbDtcclxuICB1c2VyUG9vbENsaWVudDogVXNlclBvb2xDbGllbnQ7XHJcbiAgdXNlcnNUYWJsZTogVGFibGU7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBBdXRoU3RhY2sgZXh0ZW5kcyBTdGFjayB7XHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1dGhTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCB7IHN0YWdlLCBhcGlHYXRld2F5LCBhdXRob3JpemVyLCB1c2VyUG9vbCwgdXNlclBvb2xDbGllbnQsIHVzZXJzVGFibGUgfSA9IHByb3BzO1xyXG5cclxuICAgIGNvbnN0IGNvbW1vbkVudiA9IHtcclxuICAgICAgU1RBR0U6IHN0YWdlLFxyXG4gICAgICBVU0VSU19UQUJMRTogdXNlcnNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIFVTRVJfUE9PTF9JRDogdXNlclBvb2wudXNlclBvb2xJZCxcclxuICAgICAgVVNFUl9QT09MX0NMSUVOVF9JRDogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgY29tbW9uUHJvcHMgPSB7XHJcbiAgICAgIHJ1bnRpbWU6IFJ1bnRpbWUuTk9ERUpTXzIwX1gsXHJcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXHJcbiAgICAgIGJ1bmRsaW5nOiB7XHJcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxyXG4gICAgICAgIHNvdXJjZU1hcDogc3RhZ2UgPT09ICdkZXYnLFxyXG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIDEuIFJlZ2lzdGVyIChwdWJsaWMpXHJcbiAgICBjb25zdCByZWdpc3RlckZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdSZWdpc3RlckZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1hdXRoLXJlZ2lzdGVyYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2F1dGgvcmVnaXN0ZXIvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICB1c2Vyc1RhYmxlLmdyYW50V3JpdGVEYXRhKHJlZ2lzdGVyRm4pO1xyXG4gICAgLy8gZGV27JeQ7IScIOyekOuPmSDsnbTrqZTsnbwg7J247KadIO2ZleyduOydhCDsnITtlZwgQ29nbml0byDqtoztlZxcclxuICAgIHJlZ2lzdGVyRm4uYWRkVG9Sb2xlUG9saWN5KG5ldyBQb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICBhY3Rpb25zOiBbJ2NvZ25pdG8taWRwOkFkbWluQ29uZmlybVNpZ25VcCddLFxyXG4gICAgICByZXNvdXJjZXM6IFt1c2VyUG9vbC51c2VyUG9vbEFybl0sXHJcbiAgICB9KSk7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvYXV0aC9yZWdpc3RlcicsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLlBPU1RdLFxyXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignUmVnaXN0ZXJJbnRlZ3JhdGlvbicsIHJlZ2lzdGVyRm4pLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gMi4gTG9naW4gKHB1YmxpYylcclxuICAgIGNvbnN0IGxvZ2luRm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0xvZ2luRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LWF1dGgtbG9naW5gLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvYXV0aC9sb2dpbi9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIHVzZXJzVGFibGUuZ3JhbnRSZWFkRGF0YShsb2dpbkZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9hdXRoL2xvZ2luJyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuUE9TVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdMb2dpbkludGVncmF0aW9uJywgbG9naW5GbiksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyAzLiBSZWZyZXNoIFRva2VuIChwdWJsaWMpXHJcbiAgICBjb25zdCByZWZyZXNoRm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ1JlZnJlc2hGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tYXV0aC1yZWZyZXNoLXRva2VuYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2F1dGgvcmVmcmVzaC10b2tlbi9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9hdXRoL3JlZnJlc2gnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5QT1NUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ1JlZnJlc2hJbnRlZ3JhdGlvbicsIHJlZnJlc2hGbiksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA0LiBHZXQgUHJvZmlsZSAocHJvdGVjdGVkKVxyXG4gICAgY29uc3QgZ2V0UHJvZmlsZUZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXRQcm9maWxlRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LWF1dGgtZ2V0LXByb2ZpbGVgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvYXV0aC9nZXQtcHJvZmlsZS9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIHVzZXJzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRQcm9maWxlRm4pO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL2F1dGgvbWUnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5HRVRdLFxyXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignR2V0UHJvZmlsZUludGVncmF0aW9uJywgZ2V0UHJvZmlsZUZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDUuIFVwZGF0ZSBQcm9maWxlIChwcm90ZWN0ZWQpXHJcbiAgICBjb25zdCB1cGRhdGVQcm9maWxlRm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ1VwZGF0ZVByb2ZpbGVGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tYXV0aC11cGRhdGUtcHJvZmlsZWAsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9hdXRoL3VwZGF0ZS1wcm9maWxlL2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgdXNlcnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodXBkYXRlUHJvZmlsZUZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9hdXRoL21lJyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuUFVUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ1VwZGF0ZVByb2ZpbGVJbnRlZ3JhdGlvbicsIHVwZGF0ZVByb2ZpbGVGbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19