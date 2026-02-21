// infra/stacks/cheer-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EventBus, Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';

export interface CheerStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  cheersTable: Table;
  userCheerTicketsTable: Table;
  snsTopic: Topic;
  eventBus: EventBus;
}

export class CheerStack extends Stack {
  constructor(scope: Construct, id: string, props: CheerStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, cheersTable, userCheerTicketsTable, snsTopic, eventBus } = props;

    const commonEnv = {
      STAGE: stage,
      CHEERS_TABLE: cheersTable.tableName,
      USER_CHEER_TICKETS_TABLE: userCheerTicketsTable.tableName,
      SNS_TOPIC_ARN: snsTopic.topicArn,
    };

    // ==================== Send Immediate Cheer Lambda ====================
    const sendImmediateFunction = new NodejsFunction(this, 'SendImmediateFunction', {
      functionName: `chme-${stage}-cheer-send-immediate`,
      entry: path.join(__dirname, '../../backend/services/cheer/send-immediate/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    cheersTable.grantReadWriteData(sendImmediateFunction);
    snsTopic.grantPublish(sendImmediateFunction);

    apiGateway.addRoutes({
      path: '/cheers/immediate',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CheerSendImmediateIntegration', sendImmediateFunction),
    });

    // ==================== Use Cheer Ticket Lambda ====================
    const useTicketFunction = new NodejsFunction(this, 'UseTicketFunction', {
      functionName: `chme-${stage}-cheer-use-ticket`,
      entry: path.join(__dirname, '../../backend/services/cheer/use-ticket/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    cheersTable.grantReadWriteData(useTicketFunction);
    userCheerTicketsTable.grantReadWriteData(useTicketFunction);

    apiGateway.addRoutes({
      path: '/cheers/tickets/use',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CheerUseTicketIntegration', useTicketFunction),
    });

    // ==================== Send Scheduled Cheer Lambda (EventBridge) ====================
    const sendScheduledFunction = new NodejsFunction(this, 'SendScheduledFunction', {
      functionName: `chme-${stage}-cheer-send-scheduled`,
      entry: path.join(__dirname, '../../backend/services/cheer/send-scheduled/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(60),
      memorySize: 256,
      environment: commonEnv,
    });

    cheersTable.grantReadWriteData(sendScheduledFunction);
    snsTopic.grantPublish(sendScheduledFunction);

    // EventBridge Rule: 매 1분마다 실행
    new Rule(this, 'SendScheduledCheerRule', {
      ruleName: `chme-${stage}-send-scheduled-cheer`,
      schedule: Schedule.rate(Duration.minutes(1)),
      targets: [new LambdaFunction(sendScheduledFunction)],
    });

    // ==================== Get Cheer Targets Lambda ====================
    const getTargetsFunction = new NodejsFunction(this, 'GetTargetsFunction', {
      functionName: `chme-${stage}-cheer-get-targets`,
      entry: path.join(__dirname, '../../backend/services/cheer/get-targets/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    userCheerTicketsTable.grantReadData(getTargetsFunction);

    apiGateway.addRoutes({
      path: '/cheers/targets',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('CheerGetTargetsIntegration', getTargetsFunction),
    });

    // ==================== Thank Cheer Lambda ====================
    const thankFunction = new NodejsFunction(this, 'ThankFunction', {
      functionName: `chme-${stage}-cheer-thank`,
      entry: path.join(__dirname, '../../backend/services/cheer/thank/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    cheersTable.grantReadWriteData(thankFunction);
    snsTopic.grantPublish(thankFunction);

    apiGateway.addRoutes({
      path: '/cheers/{cheerId}/thank',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CheerThankIntegration', thankFunction),
    });

    // ==================== Get My Cheers Lambda ====================
    const getMyCheersFunction = new NodejsFunction(this, 'GetMyCheersFunction', {
      functionName: `chme-${stage}-cheer-get-my`,
      entry: path.join(__dirname, '../../backend/services/cheer/get-my-cheers/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    cheersTable.grantReadData(getMyCheersFunction);

    apiGateway.addRoutes({
      path: '/cheers/my',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('CheerGetMyIntegration', getMyCheersFunction),
    });

    // ==================== Get Scheduled Cheers Lambda ====================
    const getScheduledFunction = new NodejsFunction(this, 'GetScheduledFunction', {
      functionName: `chme-${stage}-cheer-get-scheduled`,
      entry: path.join(__dirname, '../../backend/services/cheer/get-scheduled/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    cheersTable.grantReadData(getScheduledFunction);

    apiGateway.addRoutes({
      path: '/cheers/scheduled',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('CheerGetScheduledIntegration', getScheduledFunction),
    });
  }
}
