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
exports.CheerStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_1 = require("aws-cdk-lib/aws-apigatewayv2");
const aws_apigatewayv2_integrations_1 = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const aws_lambda_nodejs_1 = require("aws-cdk-lib/aws-lambda-nodejs");
const aws_lambda_1 = require("aws-cdk-lib/aws-lambda");
const aws_events_1 = require("aws-cdk-lib/aws-events");
const aws_events_targets_1 = require("aws-cdk-lib/aws-events-targets");
const path = __importStar(require("path"));
class CheerStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, apiGateway, authorizer, cheersTable, userCheerTicketsTable, userChallengesTable, snsTopic, eventBus } = props;
        const commonEnv = {
            STAGE: stage,
            CHEERS_TABLE: cheersTable.tableName,
            USER_CHEER_TICKETS_TABLE: userCheerTicketsTable.tableName,
            USER_CHALLENGES_TABLE: userChallengesTable.tableName,
            SNS_TOPIC_ARN: snsTopic.topicArn,
            EVENT_BUS_NAME: eventBus.eventBusName,
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
        // 1. Send Immediate Cheer
        const sendImmediateFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'SendImmediateFn', {
            ...commonProps,
            functionName: `chme-${stage}-cheer-send-immediate`,
            entry: path.join(__dirname, '../../backend/services/cheer/send-immediate/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        cheersTable.grantReadWriteData(sendImmediateFn);
        userCheerTicketsTable.grantReadWriteData(sendImmediateFn);
        snsTopic.grantPublish(sendImmediateFn);
        apiGateway.addRoutes({
            path: '/cheer/send-immediate',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('SendImmediateIntegration', sendImmediateFn),
            authorizer,
        });
        // 2. Use Ticket (예약 응원 생성) (protected)
        const useTicketFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'UseTicketFn', {
            ...commonProps,
            functionName: `chme-${stage}-cheer-use-ticket`,
            entry: path.join(__dirname, '../../backend/services/cheer/use-ticket/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        cheersTable.grantReadWriteData(useTicketFn);
        userCheerTicketsTable.grantReadWriteData(useTicketFn);
        eventBus.grantPutEventsTo(useTicketFn);
        apiGateway.addRoutes({
            path: '/cheer/use-ticket',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('UseTicketIntegration', useTicketFn),
            authorizer,
        });
        // 3. Send Scheduled (EventBridge 트리거 - API 없음)
        const sendScheduledFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'SendScheduledFn', {
            ...commonProps,
            functionName: `chme-${stage}-cheer-send-scheduled`,
            entry: path.join(__dirname, '../../backend/services/cheer/send-scheduled/index.ts'),
            handler: 'handler',
            environment: commonEnv,
            timeout: aws_cdk_lib_1.Duration.seconds(60),
        });
        cheersTable.grantReadWriteData(sendScheduledFn);
        snsTopic.grantPublish(sendScheduledFn);
        // EventBridge 5분마다 실행
        new aws_events_1.Rule(this, 'SendScheduledRule', {
            schedule: aws_events_1.Schedule.rate(aws_cdk_lib_1.Duration.minutes(5)),
            targets: [new aws_events_targets_1.LambdaFunction(sendScheduledFn)],
        });
        // 4. Get Cheer Targets
        const getTargetsFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'GetTargetsFn', {
            ...commonProps,
            functionName: `chme-${stage}-cheer-get-targets`,
            entry: path.join(__dirname, '../../backend/services/cheer/get-targets/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        userChallengesTable.grantReadData(getTargetsFn);
        cheersTable.grantReadData(getTargetsFn);
        apiGateway.addRoutes({
            path: '/cheer/targets',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('GetTargetsIntegration', getTargetsFn),
            authorizer,
        });
        // 5. Thank (감사 반응) (protected)
        const thankFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'ThankFn', {
            ...commonProps,
            functionName: `chme-${stage}-cheer-thank`,
            entry: path.join(__dirname, '../../backend/services/cheer/thank/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        cheersTable.grantReadWriteData(thankFn);
        apiGateway.addRoutes({
            path: '/cheer/thank',
            methods: [aws_apigatewayv2_1.HttpMethod.POST],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('ThankIntegration', thankFn),
            authorizer,
        });
        // 6. Get My Cheers (받은 응원 조회) (protected)
        const getMyCheers = new aws_lambda_nodejs_1.NodejsFunction(this, 'GetMyCheers', {
            ...commonProps,
            functionName: `chme-${stage}-cheer-get-my-cheers`,
            entry: path.join(__dirname, '../../backend/services/cheer/get-my-cheers/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        cheersTable.grantReadData(getMyCheers);
        apiGateway.addRoutes({
            path: '/cheer/my-cheers',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('GetMyCheersIntegration', getMyCheers),
            authorizer,
        });
        // 7. Get Scheduled Cheers (예약된 응원 조회) (protected)
        const getScheduledFn = new aws_lambda_nodejs_1.NodejsFunction(this, 'GetScheduledFn', {
            ...commonProps,
            functionName: `chme-${stage}-cheer-get-scheduled`,
            entry: path.join(__dirname, '../../backend/services/cheer/get-scheduled/index.ts'),
            handler: 'handler',
            environment: commonEnv,
        });
        cheersTable.grantReadData(getScheduledFn);
        apiGateway.addRoutes({
            path: '/cheer/scheduled',
            methods: [aws_apigatewayv2_1.HttpMethod.GET],
            integration: new aws_apigatewayv2_integrations_1.HttpLambdaIntegration('GetScheduledIntegration', getScheduledFn),
            authorizer,
        });
    }
}
exports.CheerStack = CheerStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hlZXItc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjaGVlci1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDZDQUEwRDtBQUUxRCxtRUFBbUU7QUFFbkUsNkZBQWtGO0FBQ2xGLHFFQUErRDtBQUMvRCx1REFBaUQ7QUFHakQsdURBQWtFO0FBQ2xFLHVFQUFnRTtBQUNoRSwyQ0FBNkI7QUFhN0IsTUFBYSxVQUFXLFNBQVEsbUJBQUs7SUFDbkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFN0gsTUFBTSxTQUFTLEdBQUc7WUFDaEIsS0FBSyxFQUFFLEtBQUs7WUFDWixZQUFZLEVBQUUsV0FBVyxDQUFDLFNBQVM7WUFDbkMsd0JBQXdCLEVBQUUscUJBQXFCLENBQUMsU0FBUztZQUN6RCxxQkFBcUIsRUFBRSxtQkFBbUIsQ0FBQyxTQUFTO1lBQ3BELGFBQWEsRUFBRSxRQUFRLENBQUMsUUFBUTtZQUNoQyxjQUFjLEVBQUUsUUFBUSxDQUFDLFlBQVk7U0FDdEMsQ0FBQztRQUVGLE1BQU0sV0FBVyxHQUFHO1lBQ2xCLE9BQU8sRUFBRSxvQkFBTyxDQUFDLFdBQVc7WUFDNUIsT0FBTyxFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUM3QixVQUFVLEVBQUUsR0FBRztZQUNmLFFBQVEsRUFBRTtnQkFDUixNQUFNLEVBQUUsSUFBSTtnQkFDWixTQUFTLEVBQUUsS0FBSyxLQUFLLEtBQUs7Z0JBQzFCLGVBQWUsRUFBRSxDQUFDLFlBQVksQ0FBQzth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RCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUscURBQXFELENBQUM7WUFDbEYsT0FBTyxFQUFFLFNBQVM7WUFDbEIsV0FBVyxFQUFFLFNBQVM7U0FDdkIsQ0FBQyxDQUFDO1FBQ0gsV0FBVyxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN2QyxVQUFVLENBQUMsU0FBUyxDQUFDO1lBQ25CLElBQUksRUFBRSxrQkFBa0I7WUFDeEIsT0FBTyxFQUFFLENBQUMsNkJBQVUsQ0FBQyxHQUFHLENBQUM7WUFDekIsV0FBVyxFQUFFLElBQUkscURBQXFCLENBQUMsd0JBQXdCLEVBQUUsV0FBVyxDQUFDO1lBQzdFLFVBQVU7U0FDWCxDQUFDLENBQUM7UUFFSCxrREFBa0Q7UUFDbEQsTUFBTSxjQUFjLEdBQUcsSUFBSSxrQ0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNoRSxHQUFHLFdBQVc7WUFDZCxZQUFZLEVBQUUsUUFBUSxLQUFLLHNCQUFzQjtZQUNqRCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUscURBQXFELENBQUM7WUFDbEYsT0FBTyxFQUFFLFNBQVM7WUFDbEIsV0FBVyxFQUFFLFNBQVM7U0FDdkIsQ0FBQyxDQUFDO1FBQ0gsV0FBVyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUMxQyxVQUFVLENBQUMsU0FBUyxDQUFDO1lBQ25CLElBQUksRUFBRSxrQkFBa0I7WUFDeEIsT0FBTyxFQUFFLENBQUMsNkJBQVUsQ0FBQyxHQUFHLENBQUM7WUFDekIsV0FBVyxFQUFFLElBQUkscURBQXFCLENBQUMseUJBQXlCLEVBQUUsY0FBYyxDQUFDO1lBQ2pGLFVBQVU7U0FDWCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFqSkQsZ0NBaUpDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU3RhY2ssIFN0YWNrUHJvcHMsIER1cmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgSHR0cEFwaSwgSHR0cE1ldGhvZCB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5djInO1xyXG5pbXBvcnQgeyBIdHRwSnd0QXV0aG9yaXplciB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5djItYXV0aG9yaXplcnMnO1xyXG5pbXBvcnQgeyBIdHRwTGFtYmRhSW50ZWdyYXRpb24gfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyLWludGVncmF0aW9ucyc7XHJcbmltcG9ydCB7IE5vZGVqc0Z1bmN0aW9uIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanMnO1xyXG5pbXBvcnQgeyBSdW50aW1lIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCB7IFRhYmxlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0IHsgVG9waWMgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcclxuaW1wb3J0IHsgRXZlbnRCdXMsIFJ1bGUsIFNjaGVkdWxlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XHJcbmltcG9ydCB7IExhbWJkYUZ1bmN0aW9uIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcclxuXHJcbmludGVyZmFjZSBDaGVlclN0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcclxuICBzdGFnZTogc3RyaW5nO1xyXG4gIGFwaUdhdGV3YXk6IEh0dHBBcGk7XHJcbiAgYXV0aG9yaXplcjogSHR0cEp3dEF1dGhvcml6ZXI7XHJcbiAgY2hlZXJzVGFibGU6IFRhYmxlO1xyXG4gIHVzZXJDaGVlclRpY2tldHNUYWJsZTogVGFibGU7XHJcbiAgdXNlckNoYWxsZW5nZXNUYWJsZTogVGFibGU7XHJcbiAgc25zVG9waWM6IFRvcGljO1xyXG4gIGV2ZW50QnVzOiBFdmVudEJ1cztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIENoZWVyU3RhY2sgZXh0ZW5kcyBTdGFjayB7XHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IENoZWVyU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgY29uc3QgeyBzdGFnZSwgYXBpR2F0ZXdheSwgYXV0aG9yaXplciwgY2hlZXJzVGFibGUsIHVzZXJDaGVlclRpY2tldHNUYWJsZSwgdXNlckNoYWxsZW5nZXNUYWJsZSwgc25zVG9waWMsIGV2ZW50QnVzIH0gPSBwcm9wcztcclxuXHJcbiAgICBjb25zdCBjb21tb25FbnYgPSB7XHJcbiAgICAgIFNUQUdFOiBzdGFnZSxcclxuICAgICAgQ0hFRVJTX1RBQkxFOiBjaGVlcnNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIFVTRVJfQ0hFRVJfVElDS0VUU19UQUJMRTogdXNlckNoZWVyVGlja2V0c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgVVNFUl9DSEFMTEVOR0VTX1RBQkxFOiB1c2VyQ2hhbGxlbmdlc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgU05TX1RPUElDX0FSTjogc25zVG9waWMudG9waWNBcm4sXHJcbiAgICAgIEVWRU5UX0JVU19OQU1FOiBldmVudEJ1cy5ldmVudEJ1c05hbWUsXHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0IGNvbW1vblByb3BzID0ge1xyXG4gICAgICBydW50aW1lOiBSdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxyXG4gICAgICBidW5kbGluZzoge1xyXG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcclxuICAgICAgICBzb3VyY2VNYXA6IHN0YWdlID09PSAnZGV2JyxcclxuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKiddLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyAxLiBTZW5kIEltbWVkaWF0ZSBDaGVlclxyXG4gICAgY29uc3Qgc2VuZEltbWVkaWF0ZUZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdTZW5kSW1tZWRpYXRlRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LWNoZWVyLXNlbmQtaW1tZWRpYXRlYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2NoZWVyL3NlbmQtaW1tZWRpYXRlL2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgY2hlZXJzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHNlbmRJbW1lZGlhdGVGbik7XHJcbiAgICB1c2VyQ2hlZXJUaWNrZXRzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHNlbmRJbW1lZGlhdGVGbik7XHJcbiAgICBzbnNUb3BpYy5ncmFudFB1Ymxpc2goc2VuZEltbWVkaWF0ZUZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9jaGVlci9zZW5kLWltbWVkaWF0ZScsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLlBPU1RdLFxyXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignU2VuZEltbWVkaWF0ZUludGVncmF0aW9uJywgc2VuZEltbWVkaWF0ZUZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDIuIFVzZSBUaWNrZXQgKOyYiOyVvSDsnZHsm5Ag7IOd7ISxKSAocHJvdGVjdGVkKVxyXG4gICAgY29uc3QgdXNlVGlja2V0Rm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ1VzZVRpY2tldEZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1jaGVlci11c2UtdGlja2V0YCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2NoZWVyL3VzZS10aWNrZXQvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICBjaGVlcnNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodXNlVGlja2V0Rm4pO1xyXG4gICAgdXNlckNoZWVyVGlja2V0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh1c2VUaWNrZXRGbik7XHJcbiAgICBldmVudEJ1cy5ncmFudFB1dEV2ZW50c1RvKHVzZVRpY2tldEZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9jaGVlci91c2UtdGlja2V0JyxcclxuICAgICAgbWV0aG9kczogW0h0dHBNZXRob2QuUE9TVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdVc2VUaWNrZXRJbnRlZ3JhdGlvbicsIHVzZVRpY2tldEZuKSxcclxuICAgICAgYXV0aG9yaXplcixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDMuIFNlbmQgU2NoZWR1bGVkIChFdmVudEJyaWRnZSDtirjrpqzqsbAgLSBBUEkg7JeG7J2MKVxyXG4gICAgY29uc3Qgc2VuZFNjaGVkdWxlZEZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdTZW5kU2NoZWR1bGVkRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LWNoZWVyLXNlbmQtc2NoZWR1bGVkYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2NoZWVyL3NlbmQtc2NoZWR1bGVkL2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcyg2MCksXHJcbiAgICB9KTtcclxuICAgIGNoZWVyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShzZW5kU2NoZWR1bGVkRm4pO1xyXG4gICAgc25zVG9waWMuZ3JhbnRQdWJsaXNoKHNlbmRTY2hlZHVsZWRGbik7XHJcblxyXG4gICAgLy8gRXZlbnRCcmlkZ2UgNeu2hOuniOuLpCDsi6TtlolcclxuICAgIG5ldyBSdWxlKHRoaXMsICdTZW5kU2NoZWR1bGVkUnVsZScsIHtcclxuICAgICAgc2NoZWR1bGU6IFNjaGVkdWxlLnJhdGUoRHVyYXRpb24ubWludXRlcyg1KSksXHJcbiAgICAgIHRhcmdldHM6IFtuZXcgTGFtYmRhRnVuY3Rpb24oc2VuZFNjaGVkdWxlZEZuKV0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyA0LiBHZXQgQ2hlZXIgVGFyZ2V0c1xyXG4gICAgY29uc3QgZ2V0VGFyZ2V0c0ZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdHZXRUYXJnZXRzRm4nLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LWNoZWVyLWdldC10YXJnZXRzYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2NoZWVyL2dldC10YXJnZXRzL2luZGV4LnRzJyksXHJcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcclxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcclxuICAgIH0pO1xyXG4gICAgdXNlckNoYWxsZW5nZXNUYWJsZS5ncmFudFJlYWREYXRhKGdldFRhcmdldHNGbik7XHJcbiAgICBjaGVlcnNUYWJsZS5ncmFudFJlYWREYXRhKGdldFRhcmdldHNGbik7XHJcbiAgICBhcGlHYXRld2F5LmFkZFJvdXRlcyh7XHJcbiAgICAgIHBhdGg6ICcvY2hlZXIvdGFyZ2V0cycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdHZXRUYXJnZXRzSW50ZWdyYXRpb24nLCBnZXRUYXJnZXRzRm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNS4gVGhhbmsgKOqwkOyCrCDrsJjsnZEpIChwcm90ZWN0ZWQpXHJcbiAgICBjb25zdCB0aGFua0ZuID0gbmV3IE5vZGVqc0Z1bmN0aW9uKHRoaXMsICdUaGFua0ZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1jaGVlci10aGFua2AsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZC9zZXJ2aWNlcy9jaGVlci90aGFuay9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIGNoZWVyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGFua0ZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9jaGVlci90aGFuaycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLlBPU1RdLFxyXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignVGhhbmtJbnRlZ3JhdGlvbicsIHRoYW5rRm4pLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNi4gR2V0IE15IENoZWVycyAo67Cb7J2AIOydkeybkCDsobDtmowpIChwcm90ZWN0ZWQpXHJcbiAgICBjb25zdCBnZXRNeUNoZWVycyA9IG5ldyBOb2RlanNGdW5jdGlvbih0aGlzLCAnR2V0TXlDaGVlcnMnLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICBmdW5jdGlvbk5hbWU6IGBjaG1lLSR7c3RhZ2V9LWNoZWVyLWdldC1teS1jaGVlcnNgLFxyXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2JhY2tlbmQvc2VydmljZXMvY2hlZXIvZ2V0LW15LWNoZWVycy9pbmRleC50cycpLFxyXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXHJcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXHJcbiAgICB9KTtcclxuICAgIGNoZWVyc1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0TXlDaGVlcnMpO1xyXG4gICAgYXBpR2F0ZXdheS5hZGRSb3V0ZXMoe1xyXG4gICAgICBwYXRoOiAnL2NoZWVyL215LWNoZWVycycsXHJcbiAgICAgIG1ldGhvZHM6IFtIdHRwTWV0aG9kLkdFVF0sXHJcbiAgICAgIGludGVncmF0aW9uOiBuZXcgSHR0cExhbWJkYUludGVncmF0aW9uKCdHZXRNeUNoZWVyc0ludGVncmF0aW9uJywgZ2V0TXlDaGVlcnMpLFxyXG4gICAgICBhdXRob3JpemVyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNy4gR2V0IFNjaGVkdWxlZCBDaGVlcnMgKOyYiOyVveuQnCDsnZHsm5Ag7KGw7ZqMKSAocHJvdGVjdGVkKVxyXG4gICAgY29uc3QgZ2V0U2NoZWR1bGVkRm4gPSBuZXcgTm9kZWpzRnVuY3Rpb24odGhpcywgJ0dldFNjaGVkdWxlZEZuJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgY2htZS0ke3N0YWdlfS1jaGVlci1nZXQtc2NoZWR1bGVkYCxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9iYWNrZW5kL3NlcnZpY2VzL2NoZWVyL2dldC1zY2hlZHVsZWQvaW5kZXgudHMnKSxcclxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxyXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52LFxyXG4gICAgfSk7XHJcbiAgICBjaGVlcnNUYWJsZS5ncmFudFJlYWREYXRhKGdldFNjaGVkdWxlZEZuKTtcclxuICAgIGFwaUdhdGV3YXkuYWRkUm91dGVzKHtcclxuICAgICAgcGF0aDogJy9jaGVlci9zY2hlZHVsZWQnLFxyXG4gICAgICBtZXRob2RzOiBbSHR0cE1ldGhvZC5HRVRdLFxyXG4gICAgICBpbnRlZ3JhdGlvbjogbmV3IEh0dHBMYW1iZGFJbnRlZ3JhdGlvbignR2V0U2NoZWR1bGVkSW50ZWdyYXRpb24nLCBnZXRTY2hlZHVsZWRGbiksXHJcbiAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19