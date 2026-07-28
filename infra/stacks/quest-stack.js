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
exports.QuestStack = void 0;
/**
 * Quest Stack
 *
 * 퀘스트 보드 API:
 *   Admin:
 *     POST /admin/quests                                  - 퀘스트 생성
 *     PUT  /admin/quests/submissions/{submissionId}/review - 제출물 승인/거절
 *
 *   User:
 *     GET  /quests                         - 퀘스트 목록 (?challengeId=&status=)
 *     POST /quests/{questId}/submit        - 퀘스트 제출
 *     GET  /quests/my-submissions          - 내 제출 내역 (?includeHistory=true)
 *
 * 2-테이블 패턴:
 *   questSubmissionsTable       → 전체 이력 (append-only)
 *   activeQuestSubmissionsTable → 현재 상태 + 유니크 보장
 */
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_1 = require("aws-cdk-lib/aws-apigatewayv2");
const aws_apigatewayv2_integrations_1 = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const path = __importStar(require("path"));
class QuestStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, apiGateway, authorizer, questsTable, questSubmissionsTable, activeQuestSubmissionsTable, challengesTable, } = props;
        const commonEnv = {
            STAGE: stage,
            QUESTS_TABLE: questsTable.tableName,
            QUEST_SUBMISSIONS_TABLE: questSubmissionsTable.tableName,
            ACTIVE_QUEST_SUBMISSIONS_TABLE: activeQuestSubmissionsTable.tableName,
            CHALLENGES_TABLE: challengesTable.tableName,
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
        // 1. Admin: Create Quest
        const createQuestFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'CreateQuestFn', {
            ...commonProps,
            functionName: `chme-${stage}-quest-create`,
            entry: path.join(__dirname, '../../backend/services/quest/create/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        questsTable.grantWriteData(createQuestFn);
        challengesTable.grantReadData(createQuestFn);
        apiGateway.addRoutes({
            path: '/admin/quests',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('AdminCreateQuestIntegration', createQuestFn),
            authorizer,
        });
        // 2. User: List Quests (현재 제출 상태 포함) (protected)
        const listQuestsFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'ListQuestsFn', {
            ...commonProps,
            functionName: `chme-${stage}-quest-list`,
            entry: path.join(__dirname, '../../backend/services/quest/list/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        questsTable.grantReadData(listQuestsFn);
        activeQuestSubmissionsTable.grantReadData(listQuestsFn);
        apiGateway.addRoutes({
            path: '/quests',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ListQuestsIntegration', listQuestsFn),
            authorizer,
        });
        // 3. User: Submit Quest (protected)
        const submitQuestFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'SubmitQuestFn', {
            ...commonProps,
            functionName: `chme-${stage}-quest-submit`,
            entry: path.join(__dirname, '../../backend/services/quest/submit/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        questsTable.grantReadWriteData(submitQuestFn);
        questSubmissionsTable.grantReadWriteData(submitQuestFn);
        activeQuestSubmissionsTable.grantReadWriteData(submitQuestFn);
        apiGateway.addRoutes({
            path: '/quests/{questId}/submit',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('SubmitQuestIntegration', submitQuestFn),
            authorizer,
        });
        // 4. Admin: Review (Approve / Reject) (protected)
        const approveQuestFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'ApproveQuestFn', {
            ...commonProps,
            functionName: `chme-${stage}-quest-approve`,
            entry: path.join(__dirname, '../../backend/services/quest/approve/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        questsTable.grantReadWriteData(approveQuestFn);
        questSubmissionsTable.grantReadWriteData(approveQuestFn);
        activeQuestSubmissionsTable.grantReadWriteData(approveQuestFn);
        apiGateway.addRoutes({
            path: '/admin/quests/submissions/{submissionId}/review',
            methods: [aws_apigatewayv2_1.HttpMethod.PUT],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ApproveQuestIntegration', approveQuestFn),
            authorizer,
        });
        // 5. Admin: List Submissions (pending 큐 + 퀘스트별 필터) (protected)
        const adminListSubmissionsFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'AdminListSubmissionsFn', {
            ...commonProps,
            functionName: `chme-${stage}-quest-admin-list-submissions`,
            entry: path.join(__dirname, '../../backend/services/quest/admin-list/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        questSubmissionsTable.grantReadData(adminListSubmissionsFn);
        questsTable.grantReadData(adminListSubmissionsFn);
        apiGateway.addRoutes({
            path: '/admin/quests/submissions',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('AdminListSubmissionsIntegration', adminListSubmissionsFn),
            authorizer,
        });
        // 6. User: My Submissions (현재 상태 or 전체 이력) (protected)
        const mySubmissionsFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'MySubmissionsFn', {
            ...commonProps,
            functionName: `chme-${stage}-quest-my-submissions`,
            entry: path.join(__dirname, '../../backend/services/quest/my-submissions/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        questSubmissionsTable.grantReadData(mySubmissionsFn);
        activeQuestSubmissionsTable.grantReadData(mySubmissionsFn);
        questsTable.grantReadData(mySubmissionsFn);
        apiGateway.addRoutes({
            path: '/quests/my-submissions',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('MySubmissionsIntegration', mySubmissionsFn),
            authorizer,
        });
    }
}
exports.QuestStack = QuestStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVlc3Qtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJxdWVzdC1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBQ0gsNkNBQTBEO0FBRTFELG1FQUFtRTtBQUVuRSw2RkFBa0Y7QUFDbEYscUVBQStEO0FBQy9ELHVEQUFpRDtBQUVqRCwyQ0FBNkI7QUFZN0IsTUFBYSxVQUFXLFNBQVEsbUJBQUs7SUFDbkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQ0osS0FBSyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQzdCLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSwyQkFBMkIsRUFBRSxlQUFlLEdBQ2pGLEdBQUcsS0FBSyxDQUFDO1FBRVYsTUFBTSxTQUFTLEdBQUc7WUFDaEIsS0FBSyxFQUE0QixLQUFLO1lBQ3RDLFlBQVksRUFBcUIsV0FBVyxDQUFDLFNBQVM7WUFDdEQsdUJBQXVCLEVBQVUscUJBQXFCLENBQUMsU0FBUztZQUNoRSw4QkFBOEIsRUFBRywyQkFBMkIsQ0FBQyxTQUFTO1lBQ3RFLGdCQUFnQixFQUFpQixlQUFlLENBQUMsU0FBUztTQUMzRCxDQUFDO1FBRUYsTUFBTSxXQUFXLEdBQUc7WUFDbEIsT0FBTyxFQUFFLG9CQUFPLENBQUMsV0FBVztZQUM1QixPQUFPLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQzdCLFVBQVUsRUFBRSxHQUFHO1lBQ2YsUUFBUSxFQUFFO2dCQUNSLE1BQU0sRUFBRSxJQUFJO2dCQUNaLFNBQVMsRUFBRSxLQUFLLEtBQUssS0FBSztnQkFDMUIsZUFBZSxFQUFFLENBQUMsWUFBWSxDQUFDO2FBQ2hDO1NBQ0YsQ0FBQztRQUVGLHlCQUF5QjtRQUN6QixNQUFNLGFBQWEsR0FBRyxJQUFJLGtDQUFjLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM5RCxHQUFHLFdBQVc7WUFDZCxZQUFZLEVBQUUsUUFBUSxLQUFLLGVBQWU7WUFDMUMsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDhDQUE4QyxDQUFDO1lBQzNFLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLFdBQVcsRUFBRSxTQUFTO1NBQ3ZCLENBQUMsQ0FBQztRQUNILFdBQVcsQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDMUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM3QyxVQUFVLENBQUMsU0FBUyxDQUFDO1lBQ25CLElBQUksRUFBRSxlQUFlO1lBQ3JCLE9BQU8sRUFBRSxDQUFDLDZCQUFVLENBQUMsSUFBSSxDQUFDO1lBQzFCLFdBQVcsRUFBRSxJQUFJLHFEQUFxQixDQUFDLDZCQUE2QixFQUFFLGFBQWEsQ0FBQztZQUNwRixVQUFVO1NBQ1gsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELE1BQU0sWUFBWSxHQUFHLElBQUksa0NBQWMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQzVELEdBQUcsV0FBVztZQUNkLFlBQVksRUFBRSxRQUFRLEtBQUssYUFBYTtZQUN4QyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsNENBQTRDLENBQUM7WUFDekUsT0FBTyxFQUFFLFNBQVM7WUFDbEIsV0FBVyxFQUFFLFNBQVM7U0FDdkIsQ0FBQyxDQUFDO1FBQ0gsV0FBVyxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN4QywyQkFBMkIsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDeEQsVUFBVSxDQUFDLFNBQVMsQ0FBQztZQUNuQixJQUFJLEVBQUUsU0FBUztZQUNmLE9BQU8sRUFBRSxDQUFDLDZCQUFVLENBQUMsR0FBRyxDQUFDO1lBQ3pCLFdBQVcsRUFBRSxJQUFJLHFEQUFxQixDQUFDLHVCQUF1QixFQUFFLFlBQVksQ0FBQztZQUM3RSxVQUFVO1NBQ1gsQ0FBQyxDQUFDO1FBRUgsb0NBQW9DO1FBQ3BDLE1BQU0sYUFBYSxHQUFHLElBQUksa0NBQWMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzlELEdBQUcsV0FBVztZQUNkLFlBQVksRUFBRSxRQUFRLEtBQUssZUFBZTtZQUMxQyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsOENBQThDLENBQUM7WUFDM0UsT0FBTyxFQUFFLFNBQVM7WUFDbEIsV0FBVyxFQUFFLFNBQVM7U0FDdkIsQ0FBQyxDQUFDO1FBQ0gsV0FBVyxDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzlDLHFCQUFxQixDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3hELDJCQUEyQixDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzlELFVBQVUsQ0FBQyxTQUFTLENBQUM7WUFDbkIsSUFBSSxFQUFFLDBCQUEwQjtZQUNoQyxPQUFPLEVBQUUsQ0FBQyw2QkFBVSxDQUFDLElBQUksQ0FBQztZQUMxQixXQUFXLEVBQUUsSUFBSSxxREFBcUIsQ0FBQyx3QkFBd0IsRUFBRSxhQUFhLENBQUM7WUFDL0UsVUFBVTtTQUNYLENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxNQUFNLGNBQWMsR0FBRyxJQUFJLGtDQUFjLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ2hFLEdBQUcsV0FBVztZQUNkLFlBQVksRUFBRSxRQUFRLEtBQUssZ0JBQWdCO1lBQzNDLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSwrQ0FBK0MsQ0FBQztZQUM1RSxPQUFPLEVBQUUsU0FBUztZQUNsQixXQUFXLEVBQUUsU0FBUztTQUN2QixDQUFDLENBQUM7UUFDSCxXQUFXLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDL0MscUJBQXFCLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDekQsMkJBQTJCLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDL0QsVUFBVSxDQUFDLFNBQVMsQ0FBQztZQUNuQixJQUFJLEVBQUUsaURBQWlEO1lBQ3ZELE9BQU8sRUFBRSxDQUFDLDZCQUFVLENBQUMsR0FBRyxDQUFDO1lBQ3pCLFdBQVcsRUFBRSxJQUFJLHFEQUFxQixDQUFDLHlCQUF5QixFQUFFLGNBQWMsQ0FBQztZQUNqRixVQUFVO1NBQ1gsQ0FBQyxDQUFDO1FBRUgsK0RBQStEO1FBQy9ELE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxrQ0FBYyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRixHQUFHLFdBQVc7WUFDZCxZQUFZLEVBQUUsUUFBUSxLQUFLLCtCQUErQjtZQUMxRCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsa0RBQWtELENBQUM7WUFDL0UsT0FBTyxFQUFFLFNBQVM7WUFDbEIsV0FBVyxFQUFFLFNBQVM7U0FDdkIsQ0FBQyxDQUFDO1FBQ0gscUJBQXFCLENBQUMsYUFBYSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDNUQsV0FBVyxDQUFDLGFBQWEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ2xELFVBQVUsQ0FBQyxTQUFTLENBQUM7WUFDbkIsSUFBSSxFQUFFLDJCQUEyQjtZQUNqQyxPQUFPLEVBQUUsQ0FBQyw2QkFBVSxDQUFDLEdBQUcsQ0FBQztZQUN6QixXQUFXLEVBQUUsSUFBSSxxREFBcUIsQ0FBQyxpQ0FBaUMsRUFBRSxzQkFBc0IsQ0FBQztZQUNqRyxVQUFVO1NBQ1gsQ0FBQyxDQUFDO1FBRUgsdURBQXVEO1FBQ3ZELE1BQU0sZUFBZSxHQUFHLElBQUksa0NBQWMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDbEUsR0FBRyxXQUFXO1lBQ2QsWUFBWSxFQUFFLFFBQVEsS0FBSyx1QkFBdUI7WUFDbEQsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLHNEQUFzRCxDQUFDO1lBQ25GLE9BQU8sRUFBRSxTQUFTO1lBQ2xCLFdBQVcsRUFBRSxTQUFTO1NBQ3ZCLENBQUMsQ0FBQztRQUNILHFCQUFxQixDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRCwyQkFBMkIsQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDM0QsV0FBVyxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUMzQyxVQUFVLENBQUMsU0FBUyxDQUFDO1lBQ25CLElBQUksRUFBRSx3QkFBd0I7WUFDOUIsT0FBTyxFQUFFLENBQUMsNkJBQVUsQ0FBQyxHQUFHLENBQUM7WUFDekIsV0FBVyxFQUFFLElBQUkscURBQXFCLENBQUMsMEJBQTBCLEVBQUUsZUFBZSxDQUFDO1lBQ25GLFVBQVU7U0FDWCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFySUQsZ0NBcUlDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFF1ZXN0IFN0YWNrXHJcbiAqXHJcbiAqIO2AmOyKpO2KuCDrs7Trk5wgQVBJOlxyXG4gKiAgIEFkbWluOlxyXG4gKiAgICAgUE9TVCAvYWRtaW4vcXVlc3RzICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC0g7YCY7Iqk7Yq4IOyDneyEsVxyXG4gKiAgICAgUFVUICAvYWRtaW4vcXVlc3RzL3N1Ym1pc3Npb25zL3tzdWJtaXNzaW9uSWR9L3JldmlldyAtIOygnOy2nOusvCDsirnsnbgv6rGw7KCIXHJcbiAqXHJcbiAqICAgVXNlcjpcclxuICogICAgIEdFVCAgL3F1ZXN0cyAgICAgICAgICAgICAgICAgICAgICAgICAtIO2AmOyKpO2KuCDrqqnroZ0gKD9jaGFsbGVuZ2VJZD0mc3RhdHVzPSlcclxuICogICAgIFBPU1QgL3F1ZXN0cy97cXVlc3RJZH0vc3VibWl0ICAgICAgICAtIO2AmOyKpO2KuCDsoJzstpxcclxuICogICAgIEdFVCAgL3F1ZXN0cy9teS1zdWJtaXNzaW9ucyAgICAgICAgICAtIOuCtCDsoJzstpwg64K07JetICg/aW5jbHVkZUhpc3Rvcnk9dHJ1ZSlcclxuICpcclxuICogMi3thYzsnbTruJQg7Yyo7YS0OlxyXG4gKiAgIHF1ZXN0U3VibWlzc2lvbnNUYWJsZSAgICAgICDihpIg7KCE7LK0IOydtOugpSAoYXBwZW5kLW9ubHkpXHJcbiAqICAgYWN0aXZlUXVlc3RTdWJtaXNzaW9uc1RhYmxlIOKGkiDtmITsnqwg7IOB7YOcICsg7Jyg64uI7YGsIOuztOyepVxyXG4gKi9cclxuaW1wb3J0IHsgU3RhY2ssIFN0YWNrUHJvcHMsIER1cmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgSHR0cEFwaSwgSHR0cE1ldGhvZCB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5djInO1xyXG5pbXBvcnQgeyBIdHRwSnd0QXV0aG9yaXplciB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5djItYXV0aG9yaXplcnMnO1xyXG5pbXBvcnQgeyBIdHRwTGFtYmRhSW50ZWdyYXRpb24gfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucyc7XHJcbmltcG9ydCB7IE5vZGVqc0Z1bmN0aW9uIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanMnO1xyXG5pbXBvcnQgeyBSdW50aW1lIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCB7IFRhYmxlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuXHJcbmludGVyZmFjZSBRdWVzdFN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcclxuICBzdGFnZTogc3RyaW5nO1xyXG4gIGFwaUdhdGV3YXk6IEh0dHBBcGk7XHJcbiAgYXV0aG9yaXplcjogSHR0cEp3dEF1dGhvcml6ZXI7XHJcbiAgcXVlc3RzVGFibGU6IFRhYmxlO1xyXG4gIHF1ZXN0U3VibWlzc2lvbnNUYWJsZTogVGFibGU7XHJcbiAgYWN0aXZlUXVlc3RTdWJtaXNzaW9uc1RhYmxlOiBUYWJsZTtcclxuICBjaGFsbGVuZ2VzVGFibGU6IFRhYmxlO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgUXVlc3RTdGFjayBleHRlbmRzIFN0YWNrIHtcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogUXVlc3RTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCB7XHJcbiAgICAgIHN0YWdlLCBhcGlHYXRld2F5LCBhdXRob3JpemVyLFxyXG4gICAgICBxdWVzdHNUYWJsZSwgcXVlc3RTdWJtaXNzaW9uc1RhYmxlLCBhY3RpdmVRdWVzdFN1Ym1pc3Npb25zVGFibGUsIGNoYWxsZW5nZXNUYWJsZSxcclxuICAgIH0gPSBwcm9wcztcclxuXHJcbiAgICBjb25zdCBjb21tb25FbnYgPSB7XHJcbiAgICAgIFNUQUdFOiAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YWdlLFxyXG4gICAgICBRVUVTVFNfVEFCTEU6ICAgICAgICAgICAgICAgICAgICBxdWVzdHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIFFVRVNUX1NVQk1JU1NJT05TX1RBQkxFOiAgICAgICAgIHF1ZXN0U3VibWlzc2lvbnNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIEFDVElWRV9RVUVTVF9TVUJNSVNTSU9OU19UQUJMRTogIGFjdGl2ZVF1ZXN0U3VibWlzc2lvbnNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIENIQUxMRU5HRVNfVEFCTEU6ICAgICAgICAgICAgICAgIGNoYWxsZW5nZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGNvbW1vblByb3BzID0ge1xyXG4gICAgICBydW50aW1lOiBSdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxyXG4gICAgICBidW5kbGluZzoge1xyXG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcclxuICAgICAgICBzb3VyY2VNYXA6IHN0YWdlID09PSAnZGV2JyxcclxuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyAxLiBBZG1pbjogQ3JlYXRlIFF1ZXN0XHJcbiAgICBjb25zdCBjcmVhdGVRdWVzdEZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdDcmVhdGVRdWVzdEZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1xdWVzdC1jcmVhdGVgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvcXVlc3QvY3JlYXRlL2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgcXVlc3RzVGFibGUuZ3JhbnRXcml0ZURhdGEoY3JlYXRlUXVlc3RGbik7XHJcbiAgICBjaGFsbGVuZ2VzVGFibGUuZ3JhbnRSZWFkRGF0YShjcmVhdGVRdWVzdEZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9hZG1pbi9xdWVzdHMnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5QT1NUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ0FkbWluQ3JlYXRlUXVlc3RJbnRlZ3JhdGlvbicsIGNyZWF0ZVF1ZXN0Rm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gMi4gVXNlcjogTGlzdCBRdWVzdHMgKO2YhOyerCDsoJzstpwg7IOB7YOcIO2PrO2VqCkgKHByb3RlY3RlZClcclxuICAgIGNvbnN0IGxpc3RRdWVzdHNGbiA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnTGlzdFF1ZXN0c0ZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1xdWVzdC1saXN0YCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL3F1ZXN0L2xpc3QvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICBxdWVzdHNUYWJsZS5ncmFudFJlYWREYXRhKGxpc3RRdWVzdHNGbik7XHJcbiAgICBhY3RpdmVRdWVzdFN1Ym1pc3Npb25zVGFibGUuZ3JhbnRSZWFkRGF0YShsaXN0UXVlc3RzRm4pO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL3F1ZXN0cycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdMaXN0UXVlc3RzSW50ZWdyYXRpb24nLCBsaXN0UXVlc3RzRm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gMy4gVXNlcjogU3VibWl0IFF1ZXN0IChwcm90ZWN0ZWQpXHJcbiAgICBjb25zdCBzdWJtaXRRdWVzdEZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdTdWJtaXRRdWVzdEZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1xdWVzdC1zdWJtaXRgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvcXVlc3Qvc3VibWl0L2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgcXVlc3RzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHN1Ym1pdFF1ZXN0Rm4pO1xyXG4gICAgcXVlc3RTdWJtaXNzaW9uc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShzdWJtaXRRdWVzdEZuKTtcclxuICAgIGFjdGl2ZVF1ZXN0U3VibWlzc2lvbnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoc3VibWl0UXVlc3RGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvcXVlc3RzL3txdWVzdElkfS9zdWJtaXQnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5QT1NUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ1N1Ym1pdFF1ZXN0SW50ZWdyYXRpb24nLCBzdWJtaXRRdWVzdEZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDQuIEFkbWluOiBSZXZpZXcgKEFwcHJvdmUgLyBSZWplY3QpIChwcm90ZWN0ZWQpXHJcbiAgICBjb25zdCBhcHByb3ZlUXVlc3RGbiA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnQXBwcm92ZVF1ZXN0Rm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LXF1ZXN0LWFwcHJvdmVgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvcXVlc3QvYXBwcm92ZS9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIHF1ZXN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShhcHByb3ZlUXVlc3RGbik7XHJcbiAgICBxdWVzdFN1Ym1pc3Npb25zVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGFwcHJvdmVRdWVzdEZuKTtcclxuICAgIGFjdGl2ZVF1ZXN0U3VibWlzc2lvbnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoYXBwcm92ZVF1ZXN0Rm4pO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL2FkbWluL3F1ZXN0cy9zdWJtaXNzaW9ucy97c3VibWlzc2lvbklkfS9yZXZpZXcnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5QVVRdLFxyXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignQXBwcm92ZVF1ZXN0SW50ZWdyYXRpb24nLCBhcHByb3ZlUXVlc3RGbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA1LiBBZG1pbjogTGlzdCBTdWJtaXNzaW9ucyAocGVuZGluZyDtgZAgKyDtgJjsiqTtirjrs4Qg7ZWE7YSwKSAocHJvdGVjdGVkKVxyXG4gICAgY29uc3QgYWRtaW5MaXN0U3VibWlzc2lvbnNGbiA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnQWRtaW5MaXN0U3VibWlzc2lvbnNGbicsIHtcclxuICAgICAgLi4uY29tbW9uUHJvcHMsXHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGNobWUtJHtzdGFnZX0tcXVlc3QtYWRtaW4tbGlzdC1zdWJtaXNzaW9uc2AsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9xdWVzdC9hZG1pbi1saXN0L2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgcXVlc3RTdWJtaXNzaW9uc1RhYmxlLmdyYW50UmVhZERhdGEoYWRtaW5MaXN0U3VibWlzc2lvbnNGbik7XHJcbiAgICBxdWVzdHNUYWJsZS5ncmFudFJlYWREYXRhKGFkbWluTGlzdFN1Ym1pc3Npb25zRm4pO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL2FkbWluL3F1ZXN0cy9zdWJtaXNzaW9ucycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdBZG1pbkxpc3RTdWJtaXNzaW9uc0ludGVncmF0aW9uJywgYWRtaW5MaXN0U3VibWlzc2lvbnNGbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA2LiBVc2VyOiBNeSBTdWJtaXNzaW9ucyAo7ZiE7J6sIOyDge2DnCBvciDsoITssrQg7J2066ClKSAocHJvdGVjdGVkKVxyXG4gICAgY29uc3QgbXlTdWJtaXNzaW9uc0ZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdNeVN1Ym1pc3Npb25zRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LXF1ZXN0LW15LXN1Ym1pc3Npb25zYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL3F1ZXN0L215LXN1Ym1pc3Npb25zL2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgcXVlc3RTdWJtaXNzaW9uc1RhYmxlLmdyYW50UmVhZERhdGEobXlTdWJtaXNzaW9uc0ZuKTtcclxuICAgIGFjdGl2ZVF1ZXN0U3VibWlzc2lvbnNUYWJsZS5ncmFudFJlYWREYXRhKG15U3VibWlzc2lvbnNGbik7XHJcbiAgICBxdWVzdHNUYWJsZS5ncmFudFJlYWREYXRhKG15U3VibWlzc2lvbnNGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvcXVlc3RzL215LXN1Ym1pc3Npb25zJyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuR0VUXSxcclxuICAgICAgaW50ZWdyYXRpb246IG5ldyBIdHRwTGFtYmRhSW50ZWdyYXRpb24oJ015U3VibWlzc2lvbnNJbnRlZ3JhdGlvbicsIG15U3VibWlzc2lvbnNGbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19