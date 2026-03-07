import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EventBus, Rule, RuleTargetInput, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction, SfnStateMachine } from 'aws-cdk-lib/aws-events-targets';
import { Alarm, ComparisonOperator, Dashboard, GraphWidget, Metric, SingleValueWidget, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { FilterPattern, LogGroup, MetricFilter } from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

interface CheerStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  cheersTable: Table;
  userCheerTicketsTable: Table;
  userChallengesTable: Table;
  challengesTable: Table;
  snsTopic: Topic;
  eventBus: EventBus;
}

export class CheerStack extends Stack {
  constructor(scope: Construct, id: string, props: CheerStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, authorizer, cheersTable, userCheerTicketsTable, userChallengesTable, challengesTable, snsTopic, eventBus } = props;

    const commonEnv = {
      STAGE: stage,
      CHEERS_TABLE: cheersTable.tableName,
      USER_CHEER_TICKETS_TABLE: userCheerTicketsTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      CHALLENGES_TABLE: challengesTable.tableName,
      SNS_TOPIC_ARN: snsTopic.topicArn,
      EVENT_BUS_NAME: eventBus.eventBusName,
      CHEER_API_V2_CONTRACT: process.env.CHEER_API_V2_CONTRACT ?? 'false',
      CHEER_API_V2_SUNSET_AT: process.env.CHEER_API_V2_SUNSET_AT ?? '2026-06-30T00:00:00.000Z',
      CHEER_STATS_TABLE: process.env.CHEER_STATS_TABLE ?? '',
      CHEER_STATS_MATERIALIZER_MAX_RETRIES: process.env.CHEER_STATS_MATERIALIZER_MAX_RETRIES ?? '5',
      CHEER_RATE_LIMITS_TABLE: process.env.CHEER_RATE_LIMITS_TABLE ?? '',
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

    const createErrorAlarm = (id: string, fnName: string, errorToken: string) => {
      const metric = createLogCountMetric(id, fnName, errorToken);

      new Alarm(this, `${id}Alarm`, {
        metric,
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
        alarmDescription: `${id} error detected for ${fnName}`
      });
    };


    const createLogCountMetric = (id: string, fnName: string, token: string) => {
      const logGroup = LogGroup.fromLogGroupName(this, `${id}LogGroup`, `/aws/lambda/${fnName}`);
      const metricFilter = new MetricFilter(this, `${id}MetricFilter`, {
        logGroup,
        filterPattern: FilterPattern.literal(token),
        metricNamespace: `chme-${stage}-cheer`,
        metricName: `${id}Count`,
        metricValue: '1'
      });

      return metricFilter.metric({
        statistic: 'Sum',
        period: Duration.minutes(5)
      });
    };

    const resolvePositiveInt = (raw: string | undefined, fallback: number): number => {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
      }

      return Math.floor(parsed);
    };


    const buildCheerOpsWidgetRows = (input: {
      replyErrorMetric: Metric;
      reactErrorMetric: Metric;
      statsErrorMetric: Metric;
      statsBucketedMetric: Metric;
      statsRealtimeFallbackMetric: Metric;
      replyRequestMetric: Metric;
      replySuccessMetric: Metric;
      replyClientErrorMetric: Metric;
      reactRequestMetric: Metric;
      reactSuccessMetric: Metric;
      reactClientErrorMetric: Metric;
      statsRequestMetric: Metric;
      statsSuccessMetric: Metric;
      cheerReplyFnRef: NodejsFunction;
      cheerReactFnRef: NodejsFunction;
      cheerStatsFnRef: NodejsFunction;
      statsMaterializerFnRef: NodejsFunction;
      materializerStateMachineStartedMetric: Metric;
      materializerStateMachineSucceededMetric: Metric;
      materializerStateMachineFailedMetric: Metric;
    }): Array<Array<GraphWidget | SingleValueWidget>> => {
      return [
        [
          new SingleValueWidget({
            title: 'Cheer Error Count (5m)',
            metrics: [input.replyErrorMetric, input.reactErrorMetric, input.statsErrorMetric],
            width: 8
          }),
          new GraphWidget({
            title: 'Cheer Handler Latency p95',
            left: [
              input.cheerReplyFnRef.metricDuration({ statistic: 'p95', period: Duration.minutes(5) }),
              input.cheerReactFnRef.metricDuration({ statistic: 'p95', period: Duration.minutes(5) }),
              input.cheerStatsFnRef.metricDuration({ statistic: 'p95', period: Duration.minutes(5) })
            ],
            width: 16
          })
        ],
        [
          new GraphWidget({
            title: 'Cheer Stats Source Mix (5m)',
            left: [input.statsBucketedMetric, input.statsRealtimeFallbackMetric],
            width: 12
          }),
          new GraphWidget({
            title: 'Materializer Invocations/Errors',
            left: [
              input.statsMaterializerFnRef.metricInvocations({ period: Duration.minutes(5) }),
              input.statsMaterializerFnRef.metricErrors({ period: Duration.minutes(5) }),
              input.materializerStateMachineFailedMetric
            ],
            width: 8
          }),
          new GraphWidget({
            title: 'Materializer Orchestrator (started/succeeded/failed)',
            left: [
              input.materializerStateMachineStartedMetric,
              input.materializerStateMachineSucceededMetric,
              input.materializerStateMachineFailedMetric
            ],
            width: 4
          })
        ],
        [
          new GraphWidget({
            title: 'Reply Traffic Split (req/success/429)',
            left: [input.replyRequestMetric, input.replySuccessMetric, input.replyClientErrorMetric],
            width: 8
          }),
          new GraphWidget({
            title: 'React Traffic Split (req/success/429)',
            left: [input.reactRequestMetric, input.reactSuccessMetric, input.reactClientErrorMetric],
            width: 8
          }),
          new GraphWidget({
            title: 'Stats Traffic Split (req/success/5xx)',
            left: [input.statsRequestMetric, input.statsSuccessMetric, input.statsErrorMetric],
            width: 8
          })
        ]
      ];
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
      authorizer,
    });

    // 2. Use Ticket (예약 응원 생성) (protected)
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
      authorizer,
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
    challengesTable.grantReadData(getTargetsFn);
    cheersTable.grantReadData(getTargetsFn);
    apiGateway.addRoutes({
      path: '/cheer/targets',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetTargetsIntegration', getTargetsFn),
      authorizer,
    });

    // 5. Thank (감사 반응) (protected)
    const thankFn = new NodejsFunction(this, 'ThankFn', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-thank`,
      entry: path.join(__dirname, '../../backend/services/cheer/thank/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheersTable.grantReadWriteData(thankFn);
    apiGateway.addRoutes({
      path: '/cheers/{cheerId}/thank',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ThankByIdIntegration', thankFn),
      authorizer,
    });
    // 하위 호환: 구형 클라이언트(body cheerId) 지원
    apiGateway.addRoutes({
      path: '/cheer/thank',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ThankLegacyIntegration', thankFn),
      authorizer,
    });

    // 6. Get My Cheers (받은 응원 조회) (protected)
    const getMyCheers = new NodejsFunction(this, 'GetMyCheers', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-get-my-cheers`,
      entry: path.join(__dirname, '../../backend/services/cheer/get-my-cheers/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheersTable.grantReadWriteData(getMyCheers);
    apiGateway.addRoutes({
      path: '/cheer/my-cheers',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetMyCheersIntegration', getMyCheers),
      authorizer,
    });

    // 7. Get Scheduled Cheers (예약된 응원 조회) (protected)
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
      authorizer,
    });

    // 8. Cheer Stats (기간/챌린지 필터) (protected)
    const cheerStatsFn = new NodejsFunction(this, 'CheerStatsFn', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-stats`,
      entry: path.join(__dirname, '../../backend/services/cheer/stats/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheersTable.grantReadData(cheerStatsFn);
    challengesTable.grantReadData(cheerStatsFn);
    userChallengesTable.grantReadData(cheerStatsFn);
    apiGateway.addRoutes({
      path: '/cheers/stats',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('CheerStatsIntegration', cheerStatsFn),
      authorizer,
    });

    // 9. Cheer reply / reaction (protected)
    const cheerReplyFn = new NodejsFunction(this, 'CheerReplyFn', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-reply`,
      entry: path.join(__dirname, '../../backend/services/cheer/reply/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheersTable.grantReadWriteData(cheerReplyFn);
    snsTopic.grantPublish(cheerReplyFn);
    if (process.env.CHEER_RATE_LIMITS_TABLE) {
      Table.fromTableName(this, 'CheerRateLimitsTableRef', process.env.CHEER_RATE_LIMITS_TABLE).grantReadWriteData(cheerReplyFn);
    }
    apiGateway.addRoutes({
      path: '/cheers/{cheerId}/reply',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CheerReplyIntegration', cheerReplyFn),
      authorizer,
    });

    const cheerReactFn = new NodejsFunction(this, 'CheerReactFn', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-react`,
      entry: path.join(__dirname, '../../backend/services/cheer/react/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheersTable.grantReadWriteData(cheerReactFn);
    snsTopic.grantPublish(cheerReactFn);
    if (process.env.CHEER_RATE_LIMITS_TABLE) {
      Table.fromTableName(this, 'CheerRateLimitsTableRefForReact', process.env.CHEER_RATE_LIMITS_TABLE).grantReadWriteData(cheerReactFn);
    }
    apiGateway.addRoutes({
      path: '/cheers/{cheerId}/reaction',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CheerReactIntegration', cheerReactFn),
      authorizer,
    });

    // 10. Cheer stats materializer (scheduled batch)
    const statsMaterializerFn = new NodejsFunction(this, 'CheerStatsMaterializerFn', {
      ...commonProps,
      functionName: `chme-${stage}-cheer-stats-materializer`,
      entry: path.join(__dirname, '../../backend/services/cheer/stats-materializer/index.ts'),
      handler: 'handler',
      environment: commonEnv,
      timeout: Duration.seconds(120),
      memorySize: 512,
    });
    cheersTable.grantReadData(statsMaterializerFn);
    if (process.env.CHEER_STATS_TABLE) {
      Table.fromTableName(this, 'CheerStatsTableRef', process.env.CHEER_STATS_TABLE).grantReadWriteData(statsMaterializerFn);
    }

    const materializerScheduleMinutes = resolvePositiveInt(process.env.CHEER_STATS_MATERIALIZER_SCHEDULE_MINUTES, 60);
    const materializerTotalSegments = resolvePositiveInt(process.env.CHEER_STATS_MATERIALIZER_TOTAL_SEGMENTS, 1);
    const materializerMaxScanPages = resolvePositiveInt(process.env.CHEER_STATS_MATERIALIZER_MAX_SCAN_PAGES, 20);
    const materializerScanPageSize = resolvePositiveInt(process.env.CHEER_STATS_MATERIALIZER_SCAN_PAGE_SIZE, 500);
    const materializerSegments = Array.from({ length: materializerTotalSegments }, (_unused, segmentIndex) => ({ segmentIndex }));

    const materializerInvokeTask = new tasks.LambdaInvoke(this, 'CheerStatsMaterializerInvokeTask', {
      lambdaFunction: statsMaterializerFn,
      payload: sfn.TaskInput.fromObject({
        dryRun: false,
        totalSegments: materializerTotalSegments,
        segmentIndex: sfn.JsonPath.numberAt('$.segmentIndex'),
        maxScanPages: materializerMaxScanPages,
        scanPageSize: materializerScanPageSize
      }),
      outputPath: '$.Payload'
    }).addRetry({
      maxAttempts: 3,
      interval: Duration.seconds(10),
      backoffRate: 2
    });

    const materializerMap = new sfn.Map(this, 'CheerStatsMaterializerSegmentMap', {
      itemsPath: '$.segments',
      maxConcurrency: Math.min(materializerTotalSegments, 5)
    });
    materializerMap.itemProcessor(materializerInvokeTask);

    const materializerStateMachine = new sfn.StateMachine(this, 'CheerStatsMaterializerOrchestrator', {
      stateMachineName: `chme-${stage}-cheer-stats-materializer-orchestrator`,
      definitionBody: sfn.DefinitionBody.fromChainable(materializerMap),
      timeout: Duration.minutes(15)
    });

    const materializerStateMachineFailedMetric = materializerStateMachine.metricFailed({
      statistic: 'Sum',
      period: Duration.minutes(5)
    });
    new Alarm(this, 'CheerStatsMaterializerOrchestratorFailedAlarm', {
      metric: materializerStateMachineFailedMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Cheer stats materializer orchestrator failure detected'
    });

    new Rule(this, 'CheerStatsMaterializerSchedule', {
      schedule: Schedule.rate(Duration.minutes(materializerScheduleMinutes)),
      targets: [
        new SfnStateMachine(materializerStateMachine, {
          input: RuleTargetInput.fromObject({
            segments: materializerSegments
          })
        })
      ],
    });

    // 11. Observability baseline alarms (reply/react/stats)
    createErrorAlarm('CheerReplyError', cheerReplyFn.functionName, 'Reply cheer error');
    createErrorAlarm('CheerReactError', cheerReactFn.functionName, 'React cheer error');
    createErrorAlarm('CheerStatsError', cheerStatsFn.functionName, 'Get cheer stats error');

    const replyErrorMetric = new Metric({
      namespace: `chme-${stage}-cheer`,
      metricName: 'CheerReplyErrorCount',
      statistic: 'Sum',
      period: Duration.minutes(5)
    });
    const reactErrorMetric = new Metric({
      namespace: `chme-${stage}-cheer`,
      metricName: 'CheerReactErrorCount',
      statistic: 'Sum',
      period: Duration.minutes(5)
    });
    const statsErrorMetric = new Metric({
      namespace: `chme-${stage}-cheer`,
      metricName: 'CheerStatsErrorCount',
      statistic: 'Sum',
      period: Duration.minutes(5)
    });

    const statsBucketedMetric = createLogCountMetric('CheerStatsBucketedSource', cheerStatsFn.functionName, "source: 'bucketed'");
    const statsRealtimeFallbackMetric = createLogCountMetric('CheerStatsRealtimeFallbackSource', cheerStatsFn.functionName, "source: 'realtime_fallback'");

    const replyRequestMetric = createLogCountMetric('CheerReplyRequest', cheerReplyFn.functionName, 'Cheer reply request received');
    const replySuccessMetric = createLogCountMetric('CheerReplySuccess', cheerReplyFn.functionName, 'Cheer reply success');
    const replyClientErrorMetric = createLogCountMetric('CheerReplyClientError', cheerReplyFn.functionName, 'REPLY_RATE_LIMIT_EXCEEDED');

    const reactRequestMetric = createLogCountMetric('CheerReactRequest', cheerReactFn.functionName, 'Cheer reaction request received');
    const reactSuccessMetric = createLogCountMetric('CheerReactSuccess', cheerReactFn.functionName, 'Cheer reaction success');
    const reactClientErrorMetric = createLogCountMetric('CheerReactClientError', cheerReactFn.functionName, 'REACTION_RATE_LIMIT_EXCEEDED');

    const statsRequestMetric = createLogCountMetric('CheerStatsRequest', cheerStatsFn.functionName, 'Get cheer stats request received');
    const statsSuccessMetric = createLogCountMetric('CheerStatsSuccess', cheerStatsFn.functionName, 'Get cheer stats success');

    const materializerStateMachineStartedMetric = materializerStateMachine.metricStarted({
      statistic: 'Sum',
      period: Duration.minutes(5)
    });
    const materializerStateMachineSucceededMetric = materializerStateMachine.metricSucceeded({
      statistic: 'Sum',
      period: Duration.minutes(5)
    });

    const cheerDashboard = new Dashboard(this, 'CheerOpsDashboard', {
      dashboardName: `chme-${stage}-cheer-ops`
    });

    const dashboardRows = buildCheerOpsWidgetRows({
      replyErrorMetric,
      reactErrorMetric,
      statsErrorMetric,
      statsBucketedMetric,
      statsRealtimeFallbackMetric,
      replyRequestMetric,
      replySuccessMetric,
      replyClientErrorMetric,
      reactRequestMetric,
      reactSuccessMetric,
      reactClientErrorMetric,
      statsRequestMetric,
      statsSuccessMetric,
      cheerReplyFnRef: cheerReplyFn,
      cheerReactFnRef: cheerReactFn,
      cheerStatsFnRef: cheerStatsFn,
      statsMaterializerFnRef: statsMaterializerFn,
      materializerStateMachineStartedMetric,
      materializerStateMachineSucceededMetric,
      materializerStateMachineFailedMetric
    });

    dashboardRows.forEach((row) => cheerDashboard.addWidgets(...row));
  }
}
