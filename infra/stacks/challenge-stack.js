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
exports.ChallengeStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_1 = require("aws-cdk-lib/aws-apigatewayv2");
const aws_apigatewayv2_integrations_1 = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const aws_events_1 = require("aws-cdk-lib/aws-events");
const aws_events_targets_1 = require("aws-cdk-lib/aws-events-targets");
const path = __importStar(require("path"));
class ChallengeStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, apiGateway, authorizer, challengesTable, userChallengesTable } = props;
        const commonEnv = {
            STAGE: stage,
            CHALLENGES_TABLE: challengesTable.tableName,
            USER_CHALLENGES_TABLE: userChallengesTable.tableName,
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
        // 1. List Challenges
        const listFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'ListFn', {
            ...commonProps,
            functionName: `chme-${stage}-challenge-list`,
            entry: path.join(__dirname, '../../backend/services/challenge/list/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        challengesTable.grantReadData(listFn);
        apiGateway.addRoutes({
            path: '/challenges',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ChallengeListIntegration', listFn),
        });
        // 2. Challenge Detail
        const detailFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'DetailFn', {
            ...commonProps,
            functionName: `chme-${stage}-challenge-detail`,
            entry: path.join(__dirname, '../../backend/services/challenge/detail/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        challengesTable.grantReadData(detailFn);
        apiGateway.addRoutes({
            path: '/challenges/{challengeId}',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ChallengeDetailIntegration', detailFn),
        });
        // 3. Join Challenge (protected)
        const joinFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'JoinFn', {
            ...commonProps,
            functionName: `chme-${stage}-challenge-join`,
            entry: path.join(__dirname, '../../backend/services/challenge/join/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        challengesTable.grantReadWriteData(joinFn);
        userChallengesTable.grantReadWriteData(joinFn);
        apiGateway.addRoutes({
            path: '/challenges/{challengeId}/join',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ChallengeJoinIntegration', joinFn),
            authorizer,
        });
        // 4. My Challenges (protected)
        const myChallengeFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'MyChallengeFn', {
            ...commonProps,
            functionName: `chme-${stage}-challenge-my`,
            entry: path.join(__dirname, '../../backend/services/challenge/my-challenges/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        userChallengesTable.grantReadData(myChallengeFn);
        challengesTable.grantReadData(myChallengeFn);
        apiGateway.addRoutes({
            path: '/challenges/my',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('MyChallengeIntegration', myChallengeFn),
            authorizer,
        });
        // 5. Challenge Stats
        const statsFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'StatsFn', {
            ...commonProps,
            functionName: `chme-${stage}-challenge-stats`,
            entry: path.join(__dirname, '../../backend/services/challenge/stats/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        challengesTable.grantReadData(statsFn);
        userChallengesTable.grantReadData(statsFn);
        apiGateway.addRoutes({
            path: '/challenges/{challengeId}/stats',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ChallengeStatsIntegration', statsFn),
        });
        // 6. Lifecycle Manager (EventBridge - 매 1시간 자동 실행)
        const lifecycleManagerFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'LifecycleManagerFn', {
            ...commonProps,
            functionName: `chme-${stage}-challenge-lifecycle-manager`,
            entry: path.join(__dirname, '../../backend/services/challenge/lifecycle-manager/index.ts'),
            handler: 'handler',
            environment: commonEnv,
            timeout: aws_cdk_lib_1.Duration.seconds(120),
            memorySize: 512,
        });
        challengesTable.grantReadWriteData(lifecycleManagerFn);
        userChallengesTable.grantReadWriteData(lifecycleManagerFn);
        new aws_events_1.Rule(this, 'LifecycleManagerRule', {
            // 매 1시간 실행 (운영환경에서는 더 짧게 조정 가능)
            schedule: aws_events_1.Schedule.rate(aws_cdk_lib_1.Duration.hours(1)),
            targets: [new aws_events_targets_1.LambdaFunction(lifecycleManagerFn)],
        });
    }
}
exports.ChallengeStack = ChallengeStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhbGxlbmdlLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2hhbGxlbmdlLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsNkNBQTBEO0FBRTFELG1FQUFtRTtBQUVuRSw2RkFBa0Y7QUFDbEYscUVBQStEO0FBQy9ELHVEQUFpRDtBQUVqRCx1REFBd0Q7QUFDeEQsdUVBQWdFO0FBQ2hFLDJDQUE2QjtBQVU3QixNQUFhLGNBQWUsU0FBUSxtQkFBSztJQUN2QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFdEYsTUFBTSxTQUFTLEdBQUc7WUFDaEIsS0FBSyxFQUFFLEtBQUs7WUFDWixnQkFBZ0IsRUFBRSxlQUFlLENBQUMsU0FBUztZQUMzQyxxQkFBcUIsRUFBRSxtQkFBbUIsQ0FBQyxTQUFTO1NBQ3JELENBQUM7UUFFRixNQUFNLFdBQVcsR0FBRztZQUNsQixPQUFPLEVBQUUsb0JBQU8sQ0FBQyxXQUFXO1lBQzVCLE9BQU8sRUFBRSxzQkFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDN0IsVUFBVSxFQUFFLEdBQUc7WUFDZixRQUFRLEVBQUU7Z0JBQ1IsTUFBTSxFQUFFLElBQUk7Z0JBQ1osU0FBUyxFQUFFLEtBQUssS0FBSyxLQUFLO2dCQUMxQixlQUFlLEVBQUUsQ0FBQyxZQUFZLENBQUM7YUFDaEM7U0FDRixDQUFDO1FBRUYscUJBQXFCO1FBQ3JCLE1BQU0sTUFBTSxHQUFHLElBQUksa0NBQWMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hELEdBQUcsV0FBVztZQUNkLFlBQVksRUFBRSxRQUFR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SUFBSSxDQUFDLHNCQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFDLE9BQU8sRUFBRSxDQUFDLElBQUksbUNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1NBQ2xELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTFIRCx3Q0EwSEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgRHVyYXRpb24gfSBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgeyBIdHRwQXBpLCBIdHRwTWV0aG9kIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mic7XHJcbmltcG9ydCB7IEh0dHBKd3RBdXRob3JpemVyIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mi1hdXRob3JpemVycyc7XHJcbmltcG9ydCB7IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5djItaW50ZWdyYXRpb25zJztcclxuaW1wb3J0IHsgTm9kZWpzRnVuY3Rpb24gfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XHJcbmltcG9ydCB7IFJ1bnRpbWUgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0IHsgVGFibGUgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBSdWxlLCBTY2hlZHVsZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xyXG5pbXBvcnQgeyBMYW1iZGFGdW5jdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcblxyXG5pbnRlcmZhY2UgQ2hhbGxlbmdlU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xyXG4gIHN0YWdlOiBzdHJpbmc7XHJcbiAgYXBpR2F0ZXdheTogSHR0cEFwaTtcclxuICBhdXRob3JpemVyOiBIdHRwSnd0QXV0aG9yaXplcjtcclxuICBjaGFsbGVuZ2VzVGFibGU6IFRhYmxlO1xyXG4gIHVzZXJDaGFsbGVuZ2VzVGFibGU6IFRhYmxlO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQ2hhbGxlbmdlU3RhY2sgZXh0ZW5kcyBTdGFjayB7XHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IENoYWxsZW5nZVN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgc3RhZ2UsIGFwaUdhdGV3YXksIGF1dGhvcml6ZXIsIGNoYWxsZW5nZXNUYWJsZSwgdXNlckNoYWxsZW5nZXNUYWJsZSB9ID0gcHJvcHM7XHJcblxyXG4gICAgY29uc3QgY29tbW9uRW52ID0ge1xyXG4gICAgICBTVEFHRTogc3RhZ2UsXHJcbiAgICAgIENIQUxMRU5HRVNfVEFCTEU6IGNoYWxsZW5nZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIFVTRVJfQ0hBTExFTkdFU19UQUJMRTogdXNlckNoYWxsZW5nZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGNvbW1vblByb3BzID0ge1xyXG4gICAgICBydW50aW1lOiBSdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxyXG4gICAgICBidW5kbGluZzoge1xyXG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcclxuICAgICAgICBzb3VyY2VNYXA6IHN0YWdlID09PSAnZGV2JyxcclxuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyAxLiBMaXN0IENoYWxsZW5nZXNcclxuICAgIGNvbnN0IGxpc3RGbiA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnTGlzdEZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1jaGFsbGVuZ2UtbGlzdGAsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9jaGFsbGVuZ2UvbGlzdC9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIGNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWREYXRhKGxpc3RGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvY2hhbGxlbmdlcycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdDaGFsbGVuZ2VMaXN0SW50ZWdyYXRpb24nLCBsaXN0Rm4pLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gMi4gQ2hhbGxlbmdlIERldGFpbFxyXG4gICAgY29uc3QgZGV0YWlsRm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0RldGFpbEZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1jaGFsbGVuZ2UtZGV0YWlsYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2NoYWxsZW5nZS9kZXRhaWwvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICBjaGFsbGVuZ2VzVGFibGUuZ3JhbnRSZWFkRGF0YShkZXRhaWxGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvY2hhbGxlbmdlcy97Y2hhbGxlbmdlSWR9JyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuR0VUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0NoYWxsZW5nZURldGFpbEludGVncmF0aW9uJywgZGV0YWlsRm4pLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gMy4gSm9pbiBDaGFsbGVuZ2UgKHByb3RlY3RlZClcclxuICAgIGNvbnN0IGpvaW5GbiA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnSm9pbkZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1jaGFsbGVuZ2Utam9pbmAsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9jaGFsbGVuZ2Uvam9pbi9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIGNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoam9pbkZuKTtcclxuICAgIHVzZXJDaGFsbGVuZ2VzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGpvaW5Gbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvY2hhbGxlbmdlcy97Y2hhbGxlbmdlSWR9L2pvaW4nLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5QT1NUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0NoYWxsZW5nZUpvaW5JbnRlZ3JhdGlvbicsIGpvaW5GbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA0LiBNeSBDaGFsbGVuZ2VzIChwcm90ZWN0ZWQpXHJcbiAgICBjb25zdCBteUNoYWxsZW5nZUZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdNeUNoYWxsZW5nZUZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1jaGFsbGVuZ2UtbXlgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvY2hhbGxlbmdlL215LWNoYWxsZW5nZXMvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICB1c2VyQ2hhbGxlbmdlc1RhYmxlLmdyYW50UmVhZERhdGEobXlDaGFsbGVuZ2VGbik7XHJcbiAgICBjaGFsbGVuZ2VzVGFibGUuZ3JhbnRSZWFkRGF0YShteUNoYWxsZW5nZUZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9jaGFsbGVuZ2VzL215JyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuR0VUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ015Q2hhbGxlbmdlSW50ZWdyYXRpb24nLCBteUNoYWxsZW5nZUZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDUuIENoYWxsZW5nZSBTdGF0c1xyXG4gICAgY29uc3Qgc3RhdHNGbiA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnU3RhdHNGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tY2hhbGxlbmdlLXN0YXRzYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2NoYWxsZW5nZS9zdGF0cy9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIGNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWREYXRhKHN0YXRzRm4pO1xyXG4gICAgdXNlckNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWREYXRhKHN0YXRzRm4pO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL2NoYWxsZW5nZXMve2NoYWxsZW5nZUlkfS9zdGF0cycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdDaGFsbGVuZ2VTdGF0c0ludGVncmF0aW9uJywgc3RhdHNGbiksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA2LiBMaWZlY3ljbGUgTWFuYWdlciAoRXZlbnRCcmlkZ2UgLSDrp6QgMeyLnOqwhCDsnpDrj5kg7Iuk7ZaJKVxyXG4gICAgY29uc3QgbGlmZWN5Y2xlTWFuYWdlckZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdMaWZlY3ljbGVNYW5hZ2VyRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LWNoYWxsZW5nZS1saWZlY3ljbGUtbWFuYWdlcmAsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9jaGFsbGVuZ2UvbGlmZWN5Y2xlLW1hbmFnZXIvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDEyMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcclxuICAgIH0pO1xyXG4gICAgY2hhbGxlbmdlc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShsaWZlY3ljbGVNYW5hZ2VyRm4pO1xyXG4gICAgdXNlckNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEobGlmZWN5Y2xlTWFuYWdlckZuKTtcclxuXHJcbiAgICBuZXcgUnVsZSh0aGlzLCAnTGlmZWN5Y2xlTWFuYWdlclJ1bGUnLCB7XHJcbiAgICAgIC8vIOunpCAx7Iuc6rCEIOyLpO2WiSAo7Jq07JiB7ZmY6rK97JeQ7ISc64qUIOuNlCDsp6fqsowg7KGw7KCVIOqwgOuKpSlcclxuICAgICAgc2NoZWR1bGU6IFNjaGVkdWxlLnJhdGUoRHVyYXRpb24uaG91cnMoMSkpLFxyXG4gICAgICB0YXJnZXRzOiBbbmV3IExhbWJkYUZ1bmN0aW9uKGxpZmVjeWNsZU1hbmFnZXJGbildLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbiJdfQ==