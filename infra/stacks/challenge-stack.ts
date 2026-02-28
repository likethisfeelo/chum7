import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';

interface ChallengeStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  challengesTable: Table;
  userChallengesTable: Table;
  personalQuestProposalsTable: Table;
  notificationsTable: Table;
}

export class ChallengeStack extends Stack {
  constructor(scope: Construct, id: string, props: ChallengeStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, authorizer, challengesTable, userChallengesTable, personalQuestProposalsTable, notificationsTable } = props;

    const commonEnv = {
      STAGE: stage,
      CHALLENGES_TABLE: challengesTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      PERSONAL_QUEST_PROPOSALS_TABLE: personalQuestProposalsTable.tableName,
      NOTIFICATIONS_TABLE: notificationsTable.tableName,
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

    // 1. List Challenges
    const listFn = new NodejsFunction(this, 'ListFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-list`,
      entry: path.join(__dirname, '../../backend/services/challenge/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadData(listFn);
    apiGateway.addRoutes({
      path: '/challenges',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ChallengeListIntegration', listFn),
    });

    // 2. Challenge Detail
    const detailFn = new NodejsFunction(this, 'DetailFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-detail`,
      entry: path.join(__dirname, '../../backend/services/challenge/detail/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadData(detailFn);
    apiGateway.addRoutes({
      path: '/challenges/{challengeId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ChallengeDetailIntegration', detailFn),
    });

    // 3. Join Challenge (protected)
    const joinFn = new NodejsFunction(this, 'JoinFn', {
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
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ChallengeJoinIntegration', joinFn),
      authorizer,
    });

    // 4. My Challenges (protected)
    const myChallengeFn = new NodejsFunction(this, 'MyChallengeFn', {
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
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('MyChallengeIntegration', myChallengeFn),
      authorizer,
    });

    // 5. Challenge Stats
    const statsFn = new NodejsFunction(this, 'StatsFn', {
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
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ChallengeStatsIntegration', statsFn),
    });


    const personalQuestSubmitFn = new NodejsFunction(this, 'PersonalQuestSubmitFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-personal-quest-submit`,
      entry: path.join(__dirname, '../../backend/services/challenge/personal-quest/submit/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadData(personalQuestSubmitFn);
    userChallengesTable.grantReadData(personalQuestSubmitFn);
    personalQuestProposalsTable.grantReadWriteData(personalQuestSubmitFn);
    notificationsTable.grantReadWriteData(personalQuestSubmitFn);
    apiGateway.addRoutes({ path: '/challenges/{challengeId}/personal-quest', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('PersonalQuestSubmitIntegration', personalQuestSubmitFn), authorizer });


    const personalQuestMyFn = new NodejsFunction(this, 'PersonalQuestMyFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-personal-quest-my`,
      entry: path.join(__dirname, '../../backend/services/challenge/personal-quest/my/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    personalQuestProposalsTable.grantReadData(personalQuestMyFn);
    apiGateway.addRoutes({ path: '/challenges/{challengeId}/personal-quest', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('PersonalQuestMyIntegration', personalQuestMyFn), authorizer });

    const personalQuestReviseFn = new NodejsFunction(this, 'PersonalQuestReviseFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-personal-quest-revise`,
      entry: path.join(__dirname, '../../backend/services/challenge/personal-quest/revise/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    personalQuestProposalsTable.grantReadWriteData(personalQuestReviseFn);
    challengesTable.grantReadData(personalQuestReviseFn);
    notificationsTable.grantReadWriteData(personalQuestReviseFn);
    apiGateway.addRoutes({ path: '/challenges/{challengeId}/personal-quest/{proposalId}', methods: [HttpMethod.PUT], integration: new HttpLambdaIntegration('PersonalQuestReviseIntegration', personalQuestReviseFn), authorizer });

    const myNotificationsFn = new NodejsFunction(this, 'NotificationListFn', {
      ...commonProps,
      functionName: `chme-${stage}-notification-list`,
      entry: path.join(__dirname, '../../backend/services/notification/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    notificationsTable.grantReadData(myNotificationsFn);
    apiGateway.addRoutes({ path: '/users/me/notifications', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('NotificationListIntegration', myNotificationsFn), authorizer });

    const markReadFn = new NodejsFunction(this, 'NotificationMarkReadFn', {
      ...commonProps,
      functionName: `chme-${stage}-notification-mark-read`,
      entry: path.join(__dirname, '../../backend/services/notification/mark-read/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    notificationsTable.grantReadWriteData(markReadFn);
    apiGateway.addRoutes({ path: '/users/me/notifications/{notificationId}/read', methods: [HttpMethod.PATCH], integration: new HttpLambdaIntegration('NotificationMarkReadIntegration', markReadFn), authorizer });

    // 6. Lifecycle Manager (EventBridge - 매 1시간 자동 실행)
    const lifecycleManagerFn = new NodejsFunction(this, 'LifecycleManagerFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-lifecycle-manager`,
      entry: path.join(__dirname, '../../backend/services/challenge/lifecycle-manager/index.ts'),
      handler: 'handler',
      environment: commonEnv,
      timeout: Duration.seconds(120),
      memorySize: 512,
    });
    challengesTable.grantReadWriteData(lifecycleManagerFn);
    userChallengesTable.grantReadWriteData(lifecycleManagerFn);
    personalQuestProposalsTable.grantReadWriteData(lifecycleManagerFn);
    notificationsTable.grantReadWriteData(lifecycleManagerFn);

    new Rule(this, 'LifecycleManagerRule', {
      // 매 1시간 실행 (운영환경에서는 더 짧게 조정 가능)
      schedule: Schedule.rate(Duration.hours(1)),
      targets: [new LambdaFunction(lifecycleManagerFn)],
    });
  }
}
