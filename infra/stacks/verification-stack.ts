import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as path from 'path';

interface VerificationStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  verificationsTable: Table;
  userChallengesTable: Table;
  challengesTable: Table;
  plazaPostsTable: Table;
  plazaCommentsTable: Table;
  plazaReactionsTable: Table;
  plazaRecommendationsTable: Table;
  uploadsBucket: IBucket;
  plazaConvertFailureAlertEmail?: string;
}

export class VerificationStack extends Stack {
  constructor(scope: Construct, id: string, props: VerificationStackProps) {
    super(scope, id, props);

    const {
      stage,
      apiGateway,
      authorizer,
      verificationsTable,
      userChallengesTable,
      challengesTable,
      plazaPostsTable,
      plazaCommentsTable,
      plazaReactionsTable,
      plazaRecommendationsTable,
      uploadsBucket,
      plazaConvertFailureAlertEmail,
    } = props;

    const commonEnv = {
      STAGE: stage,
      VERIFICATIONS_TABLE: verificationsTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      CHALLENGES_TABLE: challengesTable.tableName,
      PLAZA_POSTS_TABLE: plazaPostsTable.tableName,
      PLAZA_COMMENTS_TABLE: plazaCommentsTable.tableName,
      PLAZA_REACTIONS_TABLE: plazaReactionsTable.tableName,
      PLAZA_RECOMMENDATIONS_TABLE: plazaRecommendationsTable.tableName,
      UPLOADS_BUCKET: uploadsBucket.bucketName,
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

    // 1. Submit Verification
    const submitFn = new NodejsFunction(this, 'SubmitFn', {
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
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SubmitIntegration', submitFn),
      authorizer,
    });

    // 2. Get Verification (protected)
    const getFn = new NodejsFunction(this, 'GetFn', {
      ...commonProps,
      functionName: `chme-${stage}-verification-get`,
      entry: path.join(__dirname, '../../backend/services/verification/get/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    verificationsTable.grantReadData(getFn);
    apiGateway.addRoutes({
      path: '/verifications/{verificationId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetVerificationIntegration', getFn),
      authorizer,
    });

    // 3. List Verifications (protected)
    const listFn = new NodejsFunction(this, 'ListFn', {
      ...commonProps,
      functionName: `chme-${stage}-verification-list`,
      entry: path.join(__dirname, '../../backend/services/verification/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    verificationsTable.grantReadData(listFn);
    userChallengesTable.grantReadData(listFn);
    uploadsBucket.grantRead(listFn);
    apiGateway.addRoutes({
      path: '/verifications',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListVerificationIntegration', listFn),
      authorizer,
    });

    // 4. Upload URL (S3 Presigned URL) (protected)
    const uploadUrlFn = new NodejsFunction(this, 'UploadUrlFn', {
      ...commonProps,
      functionName: `chme-${stage}-verification-upload-url`,
      entry: path.join(__dirname, '../../backend/services/verification/upload-url/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    uploadsBucket.grantPut(uploadUrlFn);
    apiGateway.addRoutes({
      path: '/verifications/upload-url',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('UploadUrlIntegration', uploadUrlFn),
      authorizer,
    });

    const linkPreviewFn = new NodejsFunction(this, 'LinkPreviewFn', {
      ...commonProps,
      functionName: `chme-${stage}-verification-link-preview`,
      entry: path.join(__dirname, '../../backend/services/verification/link-preview/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    apiGateway.addRoutes({
      path: '/verifications/link-preview',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('LinkPreviewIntegration', linkPreviewFn),
      authorizer,
    });

    // 5. Remedy Verification (Day 6 보완) (protected)
    const remedyFn = new NodejsFunction(this, 'RemedyFn', {
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
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('RemedyIntegration', remedyFn),
      authorizer,
    });
    // 6. Plaza feed (public)
    const plazaFeedFn = new NodejsFunction(this, 'PlazaFeedFn', {
      ...commonProps,
      functionName: `chme-${stage}-plaza-feed`,
      entry: path.join(__dirname, '../../backend/services/plaza/feed/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    plazaPostsTable.grantReadData(plazaFeedFn);
    apiGateway.addRoutes({
      path: '/plaza/feed',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PlazaFeedIntegration', plazaFeedFn),
    });

    // 7. Plaza comments (GET: public, POST: protected)
    const plazaCommentsFn = new NodejsFunction(this, 'PlazaCommentsFn', {
      ...commonProps,
      functionName: `chme-${stage}-plaza-comments`,
      entry: path.join(__dirname, '../../backend/services/plaza/comments/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    plazaCommentsTable.grantReadWriteData(plazaCommentsFn);
    plazaPostsTable.grantReadWriteData(plazaCommentsFn);
    apiGateway.addRoutes({
      path: '/plaza/{plazaPostId}/comments',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PlazaGetCommentsIntegration', plazaCommentsFn),
    });
    apiGateway.addRoutes({
      path: '/plaza/{plazaPostId}/comments',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PlazaPostCommentIntegration', plazaCommentsFn),
      authorizer,
    });

    // 8. Plaza conversion job (EventBridge daily 04:00)
    const plazaConvertFn = new NodejsFunction(this, 'PlazaConvertFn', {
      ...commonProps,
      functionName: `chme-${stage}-plaza-convert-verifications`,
      entry: path.join(__dirname, '../../backend/services/plaza/convert-verifications/index.ts'),
      handler: 'handler',
      environment: commonEnv,
      timeout: Duration.minutes(2),
      memorySize: 512,
    });
    verificationsTable.grantReadWriteData(plazaConvertFn);
    plazaPostsTable.grantReadWriteData(plazaConvertFn);
    new Rule(this, 'PlazaConvertRule', {
      schedule: Schedule.cron({ minute: '0', hour: '4' }),
      targets: [new LambdaFunction(plazaConvertFn)],
    });

    // 8-1. Observability for conversion job
    const plazaConvertLogGroup = new logs.LogGroup(this, 'PlazaConvertLogGroup', {
      logGroupName: `/aws/lambda/${plazaConvertFn.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    new logs.MetricFilter(this, 'PlazaConvertConvertedMetricFilter', {
      logGroup: plazaConvertLogGroup,
      metricNamespace: 'CHME/Plaza',
      metricName: 'ConvertConvertedCount',
      filterPattern: logs.FilterPattern.stringValue('$.eventType', '=', 'plaza_convert_summary'),
      metricValue: '$.convertedCount',
      defaultValue: 0,
    });

    new logs.MetricFilter(this, 'PlazaConvertSkipNoTodayNoteMetricFilter', {
      logGroup: plazaConvertLogGroup,
      metricNamespace: 'CHME/Plaza',
      metricName: 'ConvertSkipNoTodayNoteCount',
      filterPattern: logs.FilterPattern.stringValue('$.eventType', '=', 'plaza_convert_summary'),
      metricValue: '$.skipNoTodayNoteCount',
      defaultValue: 0,
    });

    new logs.MetricFilter(this, 'PlazaConvertSkipTypeMetricFilter', {
      logGroup: plazaConvertLogGroup,
      metricNamespace: 'CHME/Plaza',
      metricName: 'ConvertSkipTypeCount',
      filterPattern: logs.FilterPattern.stringValue('$.eventType', '=', 'plaza_convert_summary'),
      metricValue: '$.skipTypeCount',
      defaultValue: 0,
    });

    new logs.MetricFilter(this, 'PlazaConvertSkipAlreadyConvertedMetricFilter', {
      logGroup: plazaConvertLogGroup,
      metricNamespace: 'CHME/Plaza',
      metricName: 'ConvertSkipAlreadyConvertedCount',
      filterPattern: logs.FilterPattern.stringValue('$.eventType', '=', 'plaza_convert_summary'),
      metricValue: '$.skipAlreadyConvertedCount',
      defaultValue: 0,
    });

    new logs.MetricFilter(this, 'PlazaConvertFailureEventMetricFilter', {
      logGroup: plazaConvertLogGroup,
      metricNamespace: 'CHME/Plaza',
      metricName: 'ConvertFailureEventCount',
      filterPattern: logs.FilterPattern.stringValue('$.eventType', '=', 'plaza_convert_failure'),
      metricValue: '1',
      defaultValue: 0,
    });

    const convertFailureTopic = new sns.Topic(this, 'PlazaConvertFailureTopic', {
      topicName: `chme-${stage}-plaza-convert-failure`,
    });

    if (plazaConvertFailureAlertEmail) {
      convertFailureTopic.addSubscription(new subscriptions.EmailSubscription(plazaConvertFailureAlertEmail));
    }

    const convertFailureEventAlarm = new cloudwatch.Alarm(this, 'PlazaConvertFailureEventAlarm', {
      alarmName: `chme-${stage}-plaza-convert-failure-event-alarm`,
      metric: new cloudwatch.Metric({
        namespace: 'CHME/Plaza',
        metricName: 'ConvertFailureEventCount',
        statistic: 'sum',
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alarm when plaza conversion job emits failure events in structured logs.',
    });
    convertFailureEventAlarm.addAlarmAction(new cwActions.SnsAction(convertFailureTopic));

    const convertFailureAlarm = new cloudwatch.Alarm(this, 'PlazaConvertFailureAlarm', {
      alarmName: `chme-${stage}-plaza-convert-failure-alarm`,
      metric: plazaConvertFn.metricErrors({ period: Duration.minutes(5), statistic: 'sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alarm when plaza conversion job Lambda reports errors.',
    });
    convertFailureAlarm.addAlarmAction(new cwActions.SnsAction(convertFailureTopic));

    new CfnOutput(this, 'PlazaConvertFailureTopicArnOutput', {
      value: convertFailureTopic.topicArn,
      description: 'SNS Topic ARN for plaza conversion failure alerts (hook this to email/Slack bridge).',
      exportName: `chme-${stage}-plaza-convert-failure-topic-arn`,
    });

    // 9. Plaza React (protected)
    const plazaReactFn = new NodejsFunction(this, 'PlazaReactFn', {
      ...commonProps,
      functionName: `chme-${stage}-plaza-react`,
      entry: path.join(__dirname, '../../backend/services/plaza/react/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    verificationsTable.grantReadWriteData(plazaReactFn);
    plazaPostsTable.grantReadWriteData(plazaReactFn);
    userChallengesTable.grantReadData(plazaReactFn);
    challengesTable.grantReadData(plazaReactFn);
    plazaReactionsTable.grantReadWriteData(plazaReactFn);
    plazaRecommendationsTable.grantReadWriteData(plazaReactFn);
    apiGateway.addRoutes({
      path: '/plaza/reactions',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PlazaReactCompatIntegration', plazaReactFn),
      authorizer,
    });
    apiGateway.addRoutes({
      path: '/plaza/{plazaPostId}/react',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PlazaReactIntegration', plazaReactFn),
      authorizer,
    });

    // 10. Plaza Recommendations (protected)
    const plazaRecommendFn = new NodejsFunction(this, 'PlazaRecommendFn', {
      ...commonProps,
      functionName: `chme-${stage}-plaza-recommend`,
      entry: path.join(__dirname, '../../backend/services/plaza/recommend/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    verificationsTable.grantReadData(plazaRecommendFn);
    plazaPostsTable.grantReadData(plazaRecommendFn);
    userChallengesTable.grantReadData(plazaRecommendFn);
    challengesTable.grantReadData(plazaRecommendFn);
    plazaRecommendationsTable.grantReadWriteData(plazaRecommendFn);
    apiGateway.addRoutes({
      path: '/plaza/recommendations',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PlazaRecommendIntegration', plazaRecommendFn),
      authorizer,
    });

    // 11. Recommendation Dismiss (protected)
    const dismissRecommendFn = new NodejsFunction(this, 'DismissRecommendFn', {
      ...commonProps,
      functionName: `chme-${stage}-plaza-recommend-dismiss`,
      entry: path.join(__dirname, '../../backend/services/plaza/dismiss-recommendation/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    plazaRecommendationsTable.grantReadWriteData(dismissRecommendFn);
    apiGateway.addRoutes({
      path: '/recommendations/{recommendationId}/dismiss',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('DismissRecommendIntegration', dismissRecommendFn),
      authorizer,
    });

  }
}
