// infra/stacks/cheer-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EventBus, Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';

interface CheerStackProps extends StackProps {
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

    const commonLambdaProps = {
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        STAGE: stage,
        CHEERS_TABLE: cheersTable.tableName,
        USER_CHEER_TICKETS_TABLE: userCheerTicketsTable.tableName,
        SNS_TOPIC_ARN: snsTopic.topicArn,
      },
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
    };

    // ==================== 1. Send Immediate Cheer ====================
    const sendImmediateFunction = new NodejsFunction(this, 'SendImmediateFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-cheer-send-immediate`,
      entry: '../backend/services/cheer/send-immediate/index.ts',
      handler: 'handler',
    });
    cheersTable.grantWriteData(sendImmediateFunction);
    snsTopic.grantPublish(sendImmediateFunction);

    apiGateway.addRoutes({
      path: '/cheers/immediate',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SendImmediateIntegration', sendImmediateFunction),
    });

    // ==================== 2. Use Cheer Ticket (Scheduled) ====================
    const useTicketFunction = new NodejsFunction(this, 'UseTicketFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-cheer-use-ticket`,
      entry: '../backend/services/cheer/use-ticket/index.ts',
      handler: 'handler',
    });
    cheersTable.grantWriteData(useTicketFunction);
    userCheerTicketsTable.grantReadWriteData(useTicketFunction);

    apiGateway.addRoutes({
      path: '/cheers/tickets/use',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('UseTicketIntegration', useTicketFunction),
    });

    // ==================== 3. Send Scheduled Cheer (EventBridge) ====================
    const sendScheduledFunction = new NodejsFunction(this, 'SendScheduledFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-cheer-send-scheduled`,
      entry: '../backend/services/cheer/send-scheduled/index.ts',
      handler: 'handler',
    });
    cheersTable.grantReadWriteData(sendScheduledFunction);
    snsTopic.grantPublish(sendScheduledFunction);

    // EventBridge Rule: 매 1분마다 실행
    new Rule(this, 'ScheduledCheerRule', {
      ruleName: `chme-${stage}-scheduled-cheer-sender`,
      schedule: Schedule.rate(Duration.minutes(1)),
      targets: [new LambdaFunction(sendScheduledFunction)],
      eventBus,
    });

    // ==================== 4. Get Cheer Targets ====================
    const getTargetsFunction = new NodejsFunction(this, 'GetTargetsFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-cheer-get-targets`,
      entry: '../backend/services/cheer/get-targets/index.ts',
      handler: 'handler',
    });
    cheersTable.grantReadData(getTargetsFunction);

    apiGateway.addRoutes({
      path: '/cheers/targets',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetTargetsIntegration', getTargetsFunction),
    });

    // ==================== 5. Thank Cheer ====================
    const thankFunction = new NodejsFunction(this, 'ThankFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-cheer-thank`,
      entry: '../backend/services/cheer/thank/index.ts',
      handler: 'handler',
    });
    cheersTable.grantReadWriteData(thankFunction);
    snsTopic.grantPublish(thankFunction);

    apiGateway.addRoutes({
      path: '/cheers/{cheerId}/thank',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ThankIntegration', thankFunction),
    });

    // ==================== 6. Get My Cheers ====================
    const getMyCheersFunction = new NodejsFunction(this, 'GetMyCheersFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-cheer-get-my`,
      entry: '../backend/services/cheer/get-my-cheers/index.ts',
      handler: 'handler',
    });
    cheersTable.grantReadData(getMyCheersFunction);

    apiGateway.addRoutes({
      path: '/cheers/my',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetMyCheersIntegration', getMyCheersFunction),
    });

    // ==================== 7. Get Scheduled Cheers ====================
    const getScheduledFunction = new NodejsFunction(this, 'GetScheduledFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-cheer-get-scheduled`,
      entry: '../backend/services/cheer/get-scheduled/index.ts',
      handler: 'handler',
    });
    cheersTable.grantReadData(getScheduledFunction);

    apiGateway.addRoutes({
      path: '/cheers/scheduled',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetScheduledIntegration', getScheduledFunction),
    });

    // ==================== Get My Tickets ====================
    const getMyTicketsFunction = new NodejsFunction(this, 'GetMyTicketsFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-tickets-get-my`,
      entry: '../backend/services/cheer/get-my-tickets/index.ts',
      handler: 'handler',
    });
    userCheerTicketsTable.grantReadData(getMyTicketsFunction);

    apiGateway.addRoutes({
      path: '/tickets/my',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetMyTicketsIntegration', getMyTicketsFunction),
    });
  }
}
