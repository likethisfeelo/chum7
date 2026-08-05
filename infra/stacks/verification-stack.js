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
exports.VerificationStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_1 = require("aws-cdk-lib/aws-apigatewayv2");
const aws_apigatewayv2_integrations_1 = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const path = __importStar(require("path"));
class VerificationStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, apiGateway, authorizer, verificationsTable, userChallengesTable, uploadsBucket } = props;
        const commonEnv = {
            STAGE: stage,
            VERIFICATIONS_TABLE: verificationsTable.tableName,
            USER_CHALLENGES_TABLE: userChallengesTable.tableName,
            UPLOADS_BUCKET: uploadsBucket.bucketName,
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
        // 1. Submit Verification
        const submitFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'SubmitFn', {
            ...commonProps,
            functionName: `chme-${stage}-verification-submit`,
            entry: path.join(__dirname, '../../backend/services/verification/submit/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        verificationsTable.grantReadWriteData(submitFn);
        userChallengesTable.grantReadWriteData(submitFn);
        apiGateway.addRoutes({
            path: '/verifications',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('SubmitIntegration', submitFn),
            authorizer,
        });
        // 2. Get Verification (protected)
        const getFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'GetFn', {
            ...commonProps,
            functionName: `chme-${stage}-verification-get`,
            entry: path.join(__dirname, '../../backend/services/verification/get/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        verificationsTable.grantReadData(getFn);
        apiGateway.addRoutes({
            path: '/verifications/{verificationId}',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('GetVerificationIntegration', getFn),
            authorizer,
        });
        // 3. List Verifications (protected)
        const listFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'ListFn', {
            ...commonProps,
            functionName: `chme-${stage}-verification-list`,
            entry: path.join(__dirname, '../../backend/services/verification/list/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        verificationsTable.grantReadData(listFn);
        userChallengesTable.grantReadData(listFn);
        apiGateway.addRoutes({
            path: '/verifications',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ListVerificationIntegration', listFn),
            authorizer,
        });
        // 4. Upload URL (S3 Presigned URL) (protected)
        const uploadUrlFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'UploadUrlFn', {
            ...commonProps,
            functionName: `chme-${stage}-verification-upload-url`,
            entry: path.join(__dirname, '../../backend/services/verification/upload-url/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        uploadsBucket.grantPut(uploadUrlFn);
        apiGateway.addRoutes({
            path: '/verifications/upload-url',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('UploadUrlIntegration', uploadUrlFn),
            authorizer,
        });
        // 5. Remedy Verification (Day 6 보완) (protected)
        const remedyFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'RemedyFn', {
            ...commonProps,
            functionName: `chme-${stage}-verification-remedy`,
            entry: path.join(__dirname, '../../backend/services/verification/remedy/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        verificationsTable.grantReadWriteData(remedyFn);
        userChallengesTable.grantReadWriteData(remedyFn);
        apiGateway.addRoutes({
            path: '/verifications/remedy',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('RemedyIntegration', remedyFn),
            authorizer,
        });
    }
}
exports.VerificationStack = VerificationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmVyaWZpY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmVyaWZpY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsNkNBQTBEO0FBRTFELG1FQUFtRTtBQUVuRSw2RkFBa0Y7QUFDbEYscUVBQStEO0FBQy9ELHVEQUFpRDtBQUdqRCwyQ0FBNkI7QUFXN0IsTUFBYSxpQkFBa0IsU0FBUSxtQkFBSztJQUMxQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxtQkFBbUIsRUFBRSxhQUFhLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFeEcsTUFBTSxTQUFTLEdBQUc7WUFDaEIsS0FBSyxFQUFFLEtBQUs7WUFDWixtQkFBbUIsRUFBRSxrQkFBa0IsQ0FBQyxTQUFTO1lBQ2pELHFCQUFxQixFQUFFLG1CQUFtQixDQUFDLFNBQVM7WUFDcEQsY0FBYyxFQUFFLGFBQWEsQ0FBQyxVQUFVO1NBQ3pDLENBQUM7UUFFRixNQUFNLFdBQVcsR0FBRztZQUNsQixPQUFPLEVBQUUsb0JBQU8sQ0FBQyxXQUFXO1lBQzVCLE9BQU8sRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDN0IsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsTUFBTSxFQUFFLElBQUk7Z0JBQ1osU0FBUyxFQUFFLEtBQUssS0FBSyxLQUFLO2dCQUMxQixlQUFlLEVBQUUsQ0FBQyxZQUFZLENBQUM7YUFDaEM7U0FDRixDQUFDO1FBRUYseUJBQXlCO1FBQ3pCLE1BQU0sUUFBUSxHQUFHLElBQUksa0NBQWMsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ3BELEdB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QUVILGdEQUFnRDtRQUNoRCxNQUFNLFFBQVEsR0FBRyxJQUFJLGtDQUFjLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUNwRCxHQUFHLFdBQVc7WUFDZCxZQUFZLEVBQUUsUUFBUSxLQUFLLHNCQUFzQjtZQUNqRCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUscURBQXFELENBQUM7WUFDbEYsT0FBTyxFQUFFLFNBQVM7WUFDbEIsV0FBVyxFQUFFLFNBQVM7U0FDdkIsQ0FBQyxDQUFDO1FBQ0gsa0JBQWtCLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDaEQsbUJBQW1CLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakQsVUFBVSxDQUFDLFNBQVMsQ0FBQztZQUNuQixJQUFJLEVBQUUsdUJBQXVCO1lBQzdCLE9BQU8sRUFBRSxDQUFDLDZCQUFVLENBQUMsSUFBSSxDQUFDO1lBQzFCLFdBQVcsRUFBRSxJQUFJLHFEQUFxQixDQUFDLG1CQUFtQixFQUFFLFFBQVEsQ0FBQztZQUNyRSxVQUFVO1NBQ1gsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBM0dELDhDQTJHQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFN0YWNrLCBTdGFja1Byb3BzLCBEdXJhdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCB7IEh0dHBBcGksIEh0dHBNZXRob2QgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyJztcclxuaW1wb3J0IHsgSHR0cEp3dEF1dGhvcml6ZXIgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyLWF1dGhvcml6ZXJzJztcclxuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMnO1xyXG5pbXBvcnQgeyBOb2RlanNGdW5jdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzJztcclxuaW1wb3J0IHsgUnVudGltZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBUYWJsZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCB7IElCdWNrZXQgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuaW50ZXJmYWNlIFZlcmlmaWNhdGlvblN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcclxuICBzdGFnZTogc3RyaW5nO1xyXG4gIGFwaUdhdGV3YXk6IEh0dHBBcGk7XHJcbiAgYXV0aG9yaXplcjogSHR0cEp3dEF1dGhvcml6ZXI7XHJcbiAgdmVyaWZpY2F0aW9uc1RhYmxlOiBUYWJsZTtcclxuICB1c2VyQ2hhbGxlbmdlc1RhYmxlOiBUYWJsZTtcclxuICB1cGxvYWRzQnVja2V0OiBJQnVja2V0O1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVmVyaWZpY2F0aW9uU3RhY2sgZXh0ZW5kcyBTdGFjayB7XHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFZlcmlmaWNhdGlvblN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgc3RhZ2UsIGFwaUdhdGV3YXksIGF1dGhvcml6ZXIsIHZlcmlmaWNhdGlvbnNUYWJsZSwgdXNlckNoYWxsZW5nZXNUYWJsZSwgdXBsb2Fkc0J1Y2tldCB9ID0gcHJvcHM7XHJcblxyXG4gICAgY29uc3QgY29tbW9uRW52ID0ge1xyXG4gICAgICBTVEFHRTogc3RhZ2UsXHJcbiAgICAgIFZFUklGSUNBVElPTlNfVEFCTEU6IHZlcmlmaWNhdGlvbnNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIFVTRVJfQ0hBTExFTkdFU19UQUJMRTogdXNlckNoYWxsZW5nZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIFVQTE9BRFNfQlVDS0VUOiB1cGxvYWRzQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGNvbW1vblByb3BzID0ge1xyXG4gICAgICBydW50aW1lOiBSdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxyXG4gICAgICBidW5kbGluZzoge1xyXG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcclxuICAgICAgICBzb3VyY2VNYXA6IHN0YWdlID09PSAnZGV2JyxcclxuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyAxLiBTdWJtaXQgVmVyaWZpY2F0aW9uXHJcbiAgICBjb25zdCBzdWJtaXRGbiA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnU3VibWl0Rm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LXZlcmlmaWNhdGlvbi1zdWJtaXRgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvdmVyaWZpY2F0aW9uL3N1Ym1pdC9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIHZlcmlmaWNhdGlvbnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoc3VibWl0Rm4pO1xyXG4gICAgdXNlckNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoc3VibWl0Rm4pO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL3ZlcmlmaWNhdGlvbnMnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5QT1NUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ1N1Ym1pdEludGVncmF0aW9uJywgc3VibWl0Rm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gMi4gR2V0IFZlcmlmaWNhdGlvbiAocHJvdGVjdGVkKVxyXG4gICAgY29uc3QgZ2V0Rm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0dldEZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS12ZXJpZmljYXRpb24tZ2V0YCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL3ZlcmlmaWNhdGlvbi9nZXQvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICB2ZXJpZmljYXRpb25zVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvdmVyaWZpY2F0aW9ucy97dmVyaWZpY2F0aW9uSWR9JyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuR0VUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0dldFZlcmlmaWNhdGlvbkludGVncmF0aW9uJywgZ2V0Rm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gMy4gTGlzdCBWZXJpZmljYXRpb25zIChwcm90ZWN0ZWQpXHJcbiAgICBjb25zdCBsaXN0Rm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0xpc3RGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tdmVyaWZpY2F0aW9uLWxpc3RgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvdmVyaWZpY2F0aW9uL2xpc3QvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICB2ZXJpZmljYXRpb25zVGFibGUuZ3JhbnRSZWFkRGF0YShsaXN0Rm4pO1xyXG4gICAgdXNlckNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWREYXRhKGxpc3RGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvdmVyaWZpY2F0aW9ucycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdMaXN0VmVyaWZpY2F0aW9uSW50ZWdyYXRpb24nLCBsaXN0Rm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNC4gVXBsb2FkIFVSTCAoUzMgUHJlc2lnbmVkIFVSTCkgKHByb3RlY3RlZClcclxuICAgIGNvbnN0IHVwbG9hZFVybEZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdVcGxvYWRVcmxGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tdmVyaWZpY2F0aW9uLXVwbG9hZC11cmxgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvdmVyaWZpY2F0aW9uL3VwbG9hZC11cmwvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICB1cGxvYWRzQnVja2V0LmdyYW50UHV0KHVwbG9hZFVybEZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy92ZXJpZmljYXRpb25zL3VwbG9hZC11cmwnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5QT1NUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ1VwbG9hZFVybEludGVncmF0aW9uJywgdXBsb2FkVXJsRm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNS4gUmVtZWR5IFZlcmlmaWNhdGlvbiAoRGF5IDYg67O07JmEKSAocHJvdGVjdGVkKVxyXG4gICAgY29uc3QgcmVtZWR5Rm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ1JlbWVkeUZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS12ZXJpZmljYXRpb24tcmVtZWR5YCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL3ZlcmlmaWNhdGlvbi9yZW1lZHkvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICB2ZXJpZmljYXRpb25zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHJlbWVkeUZuKTtcclxuICAgIHVzZXJDaGFsbGVuZ2VzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHJlbWVkeUZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy92ZXJpZmljYXRpb25zL3JlbWVkeScsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLlBPU1RdLFxyXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignUmVtZWR5SW50ZWdyYXRpb24nLCByZW1lZHlGbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19