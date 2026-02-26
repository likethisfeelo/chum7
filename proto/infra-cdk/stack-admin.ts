// infra/stacks/admin-stack.ts
import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { UserPool } from 'aws-cdk-lib/aws-cognito';

interface AdminStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  userPool: UserPool;
  usersTable: Table;
  challengesTable: Table;
  userChallengesTable: Table;
}

export class AdminStack extends Stack {
  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, userPool, usersTable, challengesTable, userChallengesTable } = props;

    const commonLambdaProps = {
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        STAGE: stage,
        USERS_TABLE: usersTable.tableName,
        CHALLENGES_TABLE: challengesTable.tableName,
        USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
    };

    // ==================== Admin Challenge Functions ====================

    // 1. Create Challenge
    const createChallengeFunction = new NodejsFunction(this, 'CreateChallengeFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-admin-create-challenge`,
      entry: '../backend/services/admin/challenge/create/index.ts',
      handler: 'handler',
    });
    challengesTable.grantWriteData(createChallengeFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminCreateChallengeIntegration', createChallengeFunction),
    });

    // 2. Update Challenge
    const updateChallengeFunction = new NodejsFunction(this, 'UpdateChallengeFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-admin-update-challenge`,
      entry: '../backend/services/admin/challenge/update/index.ts',
      handler: 'handler',
    });
    challengesTable.grantReadWriteData(updateChallengeFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('AdminUpdateChallengeIntegration', updateChallengeFunction),
    });

    // 3. Delete Challenge
    const deleteChallengeFunction = new NodejsFunction(this, 'DeleteChallengeFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-admin-delete-challenge`,
      entry: '../backend/services/admin/challenge/delete/index.ts',
      handler: 'deleteHandler',
    });
    challengesTable.grantReadWriteData(deleteChallengeFunction);
    userChallengesTable.grantReadData(deleteChallengeFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('AdminDeleteChallengeIntegration', deleteChallengeFunction),
    });

    // 4. Toggle Challenge (활성/비활성)
    const toggleChallengeFunction = new NodejsFunction(this, 'ToggleChallengeFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-admin-toggle-challenge`,
      entry: '../backend/services/admin/challenge/toggle/index.ts',
      handler: 'toggleHandler',
    });
    challengesTable.grantReadWriteData(toggleChallengeFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}/toggle',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminToggleChallengeIntegration', toggleChallengeFunction),
    });

    // 4-1. List All Challenges (admins/productowners)
    const listAllChallengesFunction = new NodejsFunction(this, 'ListAllChallengesFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-admin-list-all-challenges`,
      entry: '../backend/services/admin/challenge/list-all/index.ts',
      handler: 'handler',
    });
    challengesTable.grantReadData(listAllChallengesFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/all',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListAllChallengesIntegration', listAllChallengesFunction),
    });

    // 4-2. List My Challenges (creator scoped)
    const listMyChallengesFunction = new NodejsFunction(this, 'ListMyChallengesFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-admin-list-my-challenges`,
      entry: '../backend/services/admin/challenge/list-mine/index.ts',
      handler: 'handler',
    });
    challengesTable.grantReadData(listMyChallengesFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/mine',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListMyChallengesIntegration', listMyChallengesFunction),
    });

    // ==================== Admin User Functions ====================

    // 5. List Users
    const listUsersFunction = new NodejsFunction(this, 'ListUsersFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-admin-list-users`,
      entry: '../backend/services/admin/user/list/index.ts',
      handler: 'listUsersHandler',
    });
    usersTable.grantReadData(listUsersFunction);

    apiGateway.addRoutes({
      path: '/admin/users',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListUsersIntegration', listUsersFunction),
    });

    // ==================== Admin Stats Functions ====================

    // 6. Overview Stats
    const statsFunction = new NodejsFunction(this, 'StatsFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-admin-stats`,
      entry: '../backend/services/admin/stats/overview/index.ts',
      handler: 'statsHandler',
    });
    usersTable.grantReadData(statsFunction);
    challengesTable.grantReadData(statsFunction);
    userChallengesTable.grantReadData(statsFunction);

    apiGateway.addRoutes({
      path: '/admin/stats/overview',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminStatsIntegration', statsFunction),
    });

    // ==================== CloudWatch Alarms (PROD only) ====================
    if (stage === 'prod') {
      createChallengeFunction.metricErrors().createAlarm(this, 'AdminCreateChallengeErrorAlarm', {
        threshold: 5,
        evaluationPeriods: 1,
        alarmDescription: 'Admin create challenge errors',
      });
    }

    // ==================== Outputs ====================
    new CfnOutput(this, 'AdminApiEndpoint', {
      value: `${apiGateway.url}admin`,
      exportName: `${stage}-admin-api-endpoint`,
    });
  }
}
