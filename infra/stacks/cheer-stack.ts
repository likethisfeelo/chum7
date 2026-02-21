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

interface CheerStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  cheersTable: Table;
  userCheerTicketsTable: Table;
  userChallengesTable: Table;
  snsTopic: Topic;
  eventBus: EventBus;
}

export class CheerStack extends Stack {
  constructor(scope: Construct, id: string, props: CheerStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, cheersTable, userCheerTicketsTable, userChallengesTable, snsTopic, eventBus } = props;

    const commonEnv = {
      STAGE: stage,
      CHEERS_TABLE: cheersTable.tableName,
      USER_CHEER_TICKETS_TABLE: userCheerTicketsTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      SNS_TOPIC_ARN: snsTopic.topicArn,
      EVENT_BUS_NAME: eventBus.eventBusName,
    };

    const commonProps = {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
    };

    // 1. Send Immediate Cheer
    const sendImmediateFn = new NodejsFunction(this, 'SendImmediateFn', {
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
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SendImmediateIntegration', sendImmediateFn),
    });

    // 2. Use Ticket (예약 응원 생성)
    const useTicketFn = new NodejsFunction(this, 'UseTicketFn', {
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
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('UseTicketIntegration', useTicketFn),
    });

    // 3. Send Scheduled (EventBridge 트리거 - API 없음)
    const sendScheduledFn = new NodejsFunction(this, 'SendScheduledFn', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-send-scheduled`,
      entry: path.join(__dirname, '../../backend/services/cheer/send-scheduled/index.ts'),
      handler: 'handler',
      environment: commonEnv,
      timeout: Duration.seconds(60),
    });
    cheersTable.grantReadWriteData(sendScheduledFn);
    snsTopic.grantPublish(sendScheduledFn);

    // EventBridge 5분마다 실행
    new Rule(this, 'SendScheduledRule', {
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(sendScheduledFn)],
    });

    // 4. Get Cheer Targets
    const getTargetsFn = new NodejsFunction(this, 'GetTargetsFn', {
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
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetTargetsIntegration', getTargetsFn),
    });

    // 5. Thank (감사 반응)
    const thankFn = new NodejsFunction(this, 'ThankFn', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-thank`,
      entry: path.join(__dirname, '../../backend/services/cheer/thank/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheersTable.grantReadWriteData(thankFn);
    apiGateway.addRoutes({
      path: '/cheer/thank',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ThankIntegration', thankFn),
    });

    // 6. Get My Cheers (받은 응원 조회)
    const getMyCheers = new NodejsFunction(this, 'GetMyCheers', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-get-my-cheers`,
      entry: path.join(__dirname, '../../backend/services/cheer/get-my-cheers/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheersTable.grantReadData(getMyCheers);
    apiGateway.addRoutes({
      path: '/cheer/my-cheers',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetMyCheersIntegration', getMyCheers),
    });

    // 7. Get Scheduled Cheers (예약된 응원 조회)
    const getScheduledFn = new NodejsFunction(this, 'GetScheduledFn', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-get-scheduled`,
      entry: path.join(__dirname, '../../backend/services/cheer/get-scheduled/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheersTable.grantReadData(getScheduledFn);
    apiGateway.addRoutes({
      path: '/cheer/scheduled',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetScheduledIntegration', getScheduledFn),
    });
  }
}
