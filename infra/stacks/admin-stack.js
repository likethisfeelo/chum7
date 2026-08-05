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
exports.AdminStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_1 = require("aws-cdk-lib/aws-apigatewayv2");
const aws_apigatewayv2_integrations_1 = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const path = __importStar(require("path"));
class AdminStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, apiGateway, authorizer, usersTable, challengesTable, userChallengesTable } = props;
        const commonEnv = {
            STAGE: stage,
            USERS_TABLE: usersTable.tableName,
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
        // 1. Create Challenge (Admin)
        const createChallengeFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'CreateChallengeFn', {
            ...commonProps,
            functionName: `chme-${stage}-admin-challenge-create`,
            entry: path.join(__dirname, '../../backend/services/admin/challenge/create/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        challengesTable.grantWriteData(createChallengeFn);
        apiGateway.addRoutes({
            path: '/admin/challenges',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('AdminCreateChallengeIntegration', createChallengeFn),
            authorizer,
        });
        // 2. Update Challenge (Admin) (protected)
        const updateChallengeFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'UpdateChallengeFn', {
            ...commonProps,
            functionName: `chme-${stage}-admin-challenge-update`,
            entry: path.join(__dirname, '../../backend/services/admin/challenge/update/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        challengesTable.grantReadWriteData(updateChallengeFn);
        apiGateway.addRoutes({
            path: '/admin/challenges/{challengeId}',
            methods: [aws_apigatewayv2_1.HttpMethod.PUT],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('AdminUpdateChallengeIntegration', updateChallengeFn),
            authorizer,
        });
        // 3. Delete Challenge (Admin) (protected)
        const deleteChallengeFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'DeleteChallengeFn', {
            ...commonProps,
            functionName: `chme-${stage}-admin-challenge-delete`,
            entry: path.join(__dirname, '../../backend/services/admin/challenge/delete/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        challengesTable.grantReadWriteData(deleteChallengeFn);
        userChallengesTable.grantReadData(deleteChallengeFn);
        apiGateway.addRoutes({
            path: '/admin/challenges/{challengeId}',
            methods: [aws_apigatewayv2_1.HttpMethod.DELETE],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('AdminDeleteChallengeIntegration', deleteChallengeFn),
            authorizer,
        });
        // 4. Lifecycle Transition (Admin) - 수동 라이프사이클 전환 (protected)
        const lifecycleTransitionFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'LifecycleTransitionFn', {
            ...commonProps,
            functionName: `chme-${stage}-admin-challenge-lifecycle-transition`,
            entry: path.join(__dirname, '../../backend/services/admin/challenge/lifecycle-transition/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        challengesTable.grantReadWriteData(lifecycleTransitionFn);
        apiGateway.addRoutes({
            path: '/admin/challenges/{challengeId}/lifecycle',
            methods: [aws_apigatewayv2_1.HttpMethod.PUT],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('AdminLifecycleTransitionIntegration', lifecycleTransitionFn),
            authorizer,
        });
        // 5. List Users (Admin) (protected)
        const listUsersFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'ListUsersFn', {
            ...commonProps,
            functionName: `chme-${stage}-admin-user-list`,
            entry: path.join(__dirname, '../../backend/services/admin/user/list/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        usersTable.grantReadData(listUsersFn);
        apiGateway.addRoutes({
            path: '/admin/users',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('AdminListUsersIntegration', listUsersFn),
            authorizer,
        });
        // 6. Stats Overview (Admin) (protected)
        const statsFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'StatsFn', {
            ...commonProps,
            functionName: `chme-${stage}-admin-stats`,
            entry: path.join(__dirname, '../../backend/services/admin/stats/overview/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        usersTable.grantReadData(statsFn);
        challengesTable.grantReadData(statsFn);
        userChallengesTable.grantReadData(statsFn);
        apiGateway.addRoutes({
            path: '/admin/stats',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('AdminStatsIntegration', statsFn),
            authorizer,
        });
    }
}
exports.AdminStack = AdminStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRtaW4tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhZG1pbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDZDQUEwRDtBQUUxRCxtRUFBbUU7QUFFbkUsNkZBQWtGO0FBQ2xGLHFFQUErRDtBQUMvRCx1REFBaUQ7QUFFakQsMkNBQTZCO0FBVzdCLE1BQWEsVUFBVyxTQUFRLG1CQUFLO0lBQ25DLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFbEcsTUFBTSxTQUFTLEdBQUc7WUFDaEIsS0FBSyxFQUFFLEtBQUs7WUFDWixXQUFXLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDakMsZ0JBQWdCLEVBQUUsZUFBZSxDQUFDLFNBQVM7WUFDM0MscUJBQXFCLEVBQUUsbUJBQW1CLENBQUMsU0FBUztTQUNyRCxDQUFDO1FBRUYsTUFBTSxXQUFXLEdBQUc7WUFDbEIsT0FBTyxFQUFFLG9CQUFPLENBQUMsV0FBVztZQUM1QixPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzdCLFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFO2dCQUNSLE1BQU0sRUFBRSxJQUFJO2dCQUNaLFNBQVMsRUFBRSxLQUFLLEtBQUssS0FBSztnQkFDMUIsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2FBQ2hDO1NBQ0YsQ0FBQztRQUVGLDhCQUE4QjtRQUM5QixNQUFNLGlCQUFpQixHQUFHLElBQUksa0NBQWMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdEUsR0FBRyxXQUFXO1lBQ2QsWUFB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QU8sQ0FBQztZQUN4RSxVQUFVO1NBQ1gsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBM0hELGdDQTJIQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFN0YWNrLCBTdGFja1Byb3BzLCBEdXJhdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCB7IEh0dHBBcGksIEh0dHBNZXRob2QgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyJztcclxuaW1wb3J0IHsgSHR0cEp3dEF1dGhvcml6ZXIgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyLWF1dGhvcml6ZXJzJztcclxuaW1wb3J0IHsgSHR0cExhbWJkYUludGVncmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXl2Mi1pbnRlZ3JhdGlvbnMnO1xyXG5pbXBvcnQgeyBOb2RlanNGdW5jdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzJztcclxuaW1wb3J0IHsgUnVudGltZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBUYWJsZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcblxyXG5pbnRlcmZhY2UgQWRtaW5TdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XHJcbiAgc3RhZ2U6IHN0cmluZztcclxuICBhcGlHYXRld2F5OiBIdHRwQXBpO1xyXG4gIGF1dGhvcml6ZXI6IEh0dHBKd3RBdXRob3JpemVyO1xyXG4gIHVzZXJzVGFibGU6IFRhYmxlO1xyXG4gIGNoYWxsZW5nZXNUYWJsZTogVGFibGU7XHJcbiAgdXNlckNoYWxsZW5nZXNUYWJsZTogVGFibGU7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBBZG1pblN0YWNrIGV4dGVuZHMgU3RhY2sge1xyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBZG1pblN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgc3RhZ2UsIGFwaUdhdGV3YXksIGF1dGhvcml6ZXIsIHVzZXJzVGFibGUsIGNoYWxsZW5nZXNUYWJsZSwgdXNlckNoYWxsZW5nZXNUYWJsZSB9ID0gcHJvcHM7XHJcblxyXG4gICAgY29uc3QgY29tbW9uRW52ID0ge1xyXG4gICAgICBTVEFHRTogc3RhZ2UsXHJcbiAgICAgIFVTRVJTX1RBQkxFOiB1c2Vyc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgQ0hBTExFTkdFU19UQUJMRTogY2hhbGxlbmdlc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgVVNFUl9DSEFMTEVOR0VTX1RBQkxFOiB1c2VyQ2hhbGxlbmdlc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgY29tbW9uUHJvcHMgPSB7XHJcbiAgICAgIHJ1bnRpbWU6IFJ1bnRpbWUuTk9ERUpTXzIwX1gsXHJcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXHJcbiAgICAgIGJ1bmRsaW5nOiB7XHJcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxyXG4gICAgICAgIHNvdXJjZU1hcDogc3RhZ2UgPT09ICdkZXYnLFxyXG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJ10sXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIDEuIENyZWF0ZSBDaGFsbGVuZ2UgKEFkbWluKVxyXG4gICAgY29uc3QgY3JlYXRlQ2hhbGxlbmdlRm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0NyZWF0ZUNoYWxsZW5nZUZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1hZG1pbi1jaGFsbGVuZ2UtY3JlYXRlYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2FkbWluL2NoYWxsZW5nZS9jcmVhdGUvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICBjaGFsbGVuZ2VzVGFibGUuZ3JhbnRXcml0ZURhdGEoY3JlYXRlQ2hhbGxlbmdlRm4pO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL2FkbWluL2NoYWxsZW5nZXMnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5QT1NUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0FkbWluQ3JlYXRlQ2hhbGxlbmdlSW50ZWdyYXRpb24nLCBjcmVhdGVDaGFsbGVuZ2VGbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyAyLiBVcGRhdGUgQ2hhbGxlbmdlIChBZG1pbikgKHByb3RlY3RlZClcclxuICAgIGNvbnN0IHVwZGF0ZUNoYWxsZW5nZUZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdVcGRhdGVDaGFsbGVuZ2VGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tYWRtaW4tY2hhbGxlbmdlLXVwZGF0ZWAsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9hZG1pbi9jaGFsbGVuZ2UvdXBkYXRlL2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgY2hhbGxlbmdlc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh1cGRhdGVDaGFsbGVuZ2VGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvYWRtaW4vY2hhbGxlbmdlcy97Y2hhbGxlbmdlSWR9JyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuUFVUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0FkbWluVXBkYXRlQ2hhbGxlbmdlSW50ZWdyYXRpb24nLCB1cGRhdGVDaGFsbGVuZ2VGbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyAzLiBEZWxldGUgQ2hhbGxlbmdlIChBZG1pbikgKHByb3RlY3RlZClcclxuICAgIGNvbnN0IGRlbGV0ZUNoYWxsZW5nZUZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdEZWxldGVDaGFsbGVuZ2VGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tYWRtaW4tY2hhbGxlbmdlLWRlbGV0ZWAsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9hZG1pbi9jaGFsbGVuZ2UvZGVsZXRlL2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgY2hhbGxlbmdlc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShkZWxldGVDaGFsbGVuZ2VGbik7XHJcbiAgICB1c2VyQ2hhbGxlbmdlc1RhYmxlLmdyYW50UmVhZERhdGEoZGVsZXRlQ2hhbGxlbmdlRm4pO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL2FkbWluL2NoYWxsZW5nZXMve2NoYWxsZW5nZUlkfScsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkRFTEVURV0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdBZG1pbkRlbGV0ZUNoYWxsZW5nZUludGVncmF0aW9uJywgZGVsZXRlQ2hhbGxlbmdlRm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNC4gTGlmZWN5Y2xlIFRyYW5zaXRpb24gKEFkbWluKSAtIOyImOuPmSDrnbzsnbTtlITsgqzsnbTtgbQg7KCE7ZmYIChwcm90ZWN0ZWQpXHJcbiAgICBjb25zdCBsaWZlY3ljbGVUcmFuc2l0aW9uRm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0xpZmVjeWNsZVRyYW5zaXRpb25GbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tYWRtaW4tY2hhbGxlbmdlLWxpZmVjeWNsZS10cmFuc2l0aW9uYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2FkbWluL2NoYWxsZW5nZS9saWZlY3ljbGUtdHJhbnNpdGlvbi9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIGNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEobGlmZWN5Y2xlVHJhbnNpdGlvbkZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9hZG1pbi9jaGFsbGVuZ2VzL3tjaGFsbGVuZ2VJZH0vbGlmZWN5Y2xlJyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuUFVUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0FkbWluTGlmZWN5Y2xlVHJhbnNpdGlvbkludGVncmF0aW9uJywgbGlmZWN5Y2xlVHJhbnNpdGlvbkZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDUuIExpc3QgVXNlcnMgKEFkbWluKSAocHJvdGVjdGVkKVxyXG4gICAgY29uc3QgbGlzdFVzZXJzRm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0xpc3RVc2Vyc0ZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1hZG1pbi11c2VyLWxpc3RgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvYWRtaW4vdXNlci9saXN0L2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgdXNlcnNUYWJsZS5ncmFudFJlYWREYXRhKGxpc3RVc2Vyc0ZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9hZG1pbi91c2VycycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdBZG1pbkxpc3RVc2Vyc0ludGVncmF0aW9uJywgbGlzdFVzZXJzRm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNi4gU3RhdHMgT3ZlcnZpZXcgKEFkbWluKSAocHJvdGVjdGVkKVxyXG4gICAgY29uc3Qgc3RhdHNGbiA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnU3RhdHNGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tYWRtaW4tc3RhdHNgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvYWRtaW4vc3RhdHMvb3ZlcnZpZXcvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICB1c2Vyc1RhYmxlLmdyYW50UmVhZERhdGEoc3RhdHNGbik7XHJcbiAgICBjaGFsbGVuZ2VzVGFibGUuZ3JhbnRSZWFkRGF0YShzdGF0c0ZuKTtcclxuICAgIHVzZXJDaGFsbGVuZ2VzVGFibGUuZ3JhbnRSZWFkRGF0YShzdGF0c0ZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9hZG1pbi9zdGF0cycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdBZG1pblN0YXRzSW50ZWdyYXRpb24nLCBzdGF0c0ZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=