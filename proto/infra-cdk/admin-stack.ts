// infra/stacks/admin-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

export interface AdminStackProps extends StackProps {
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

    const commonEnv = {
      STAGE: stage,
      USER_POOL_ID: userPool.userPoolId,
      USERS_TABLE: usersTable.tableName,
      CHALLENGES_TABLE: challengesTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
    };

    // ==================== Create Challenge Lambda ====================
    const createChallengeFunction = new NodejsFunction(this, 'CreateChallengeFunction', {
      functionName: `chme-${stage}-admin-create-challenge`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/create/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadWriteData(createChallengeFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminCreateChallengeIntegration', createChallengeFunction),
    });

    // ==================== Update Challenge Lambda ====================
    const updateChallengeFunction = new NodejsFunction(this, 'UpdateChallengeFunction', {
      functionName: `chme-${stage}-admin-update-challenge`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/update/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadWriteData(updateChallengeFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('AdminUpdateChallengeIntegration', updateChallengeFunction),
    });

    // ==================== Delete Challenge Lambda ====================
    const deleteChallengeFunction = new NodejsFunction(this, 'DeleteChallengeFunction', {
      functionName: `chme-${stage}-admin-delete-challenge`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/delete/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadWriteData(deleteChallengeFunction);
    userChallengesTable.grantReadData(deleteChallengeFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('AdminDeleteChallengeIntegration', deleteChallengeFunction),
    });

    // ==================== Toggle Challenge Lambda ====================
    const toggleChallengeFunction = new NodejsFunction(this, 'ToggleChallengeFunction', {
      functionName: `chme-${stage}-admin-toggle-challenge`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/toggle/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadWriteData(toggleChallengeFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}/toggle',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminToggleChallengeIntegration', toggleChallengeFunction),
    });

    // ==================== List All Challenges Lambda (admins/productowners) ====================
    const listAllChallengesFunction = new NodejsFunction(this, 'ListAllChallengesFunction', {
      functionName: `chme-${stage}-admin-list-all-challenges`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/list-all/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadData(listAllChallengesFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/all',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListAllChallengesIntegration', listAllChallengesFunction),
    });

    // ==================== List My Challenges Lambda (creator scoped) ====================
    const listMyChallengesFunction = new NodejsFunction(this, 'ListMyChallengesFunction', {
      functionName: `chme-${stage}-admin-list-my-challenges`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/list-mine/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadData(listMyChallengesFunction);

    apiGateway.addRoutes({
      path: '/admin/challenges/mine',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListMyChallengesIntegration', listMyChallengesFunction),
    });

    // ==================== List Users Lambda ====================
    const listUsersFunction = new NodejsFunction(this, 'ListUsersFunction', {
      functionName: `chme-${stage}-admin-list-users`,
      entry: path.join(__dirname, '../../backend/services/admin/user/list/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    usersTable.grantReadData(listUsersFunction);

    apiGateway.addRoutes({
      path: '/admin/users',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListUsersIntegration', listUsersFunction),
    });

    // ==================== Stats Overview Lambda ====================
    const statsOverviewFunction = new NodejsFunction(this, 'StatsOverviewFunction', {
      functionName: `chme-${stage}-admin-stats-overview`,
      entry: path.join(__dirname, '../../backend/services/admin/stats/overview/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    usersTable.grantReadData(statsOverviewFunction);
    challengesTable.grantReadData(statsOverviewFunction);
    userChallengesTable.grantReadData(statsOverviewFunction);

    apiGateway.addRoutes({
      path: '/admin/stats/overview',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminStatsOverviewIntegration', statsOverviewFunction),
    });
  }
}
