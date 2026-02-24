import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

interface AdminStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  usersTable: Table;
  challengesTable: Table;
  userChallengesTable: Table;
}

export class AdminStack extends Stack {
  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, usersTable, challengesTable, userChallengesTable } = props;

    const commonEnv = {
      STAGE: stage,
      USERS_TABLE: usersTable.tableName,
      CHALLENGES_TABLE: challengesTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
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

    // 1. Create Challenge (Admin)
    const createChallengeFn = new NodejsFunction(this, 'CreateChallengeFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-challenge-create`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/create/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantWriteData(createChallengeFn);
    apiGateway.addRoutes({
      path: '/admin/challenges',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminCreateChallengeIntegration', createChallengeFn),
    });

    // 2. Update Challenge (Admin)
    const updateChallengeFn = new NodejsFunction(this, 'UpdateChallengeFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-challenge-update`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/update/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadWriteData(updateChallengeFn);
    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('AdminUpdateChallengeIntegration', updateChallengeFn),
    });

    // 3. Delete Challenge (Admin)
    const deleteChallengeFn = new NodejsFunction(this, 'DeleteChallengeFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-challenge-delete`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/delete/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadWriteData(deleteChallengeFn);
    userChallengesTable.grantReadData(deleteChallengeFn);
    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('AdminDeleteChallengeIntegration', deleteChallengeFn),
    });

    // 4. Lifecycle Transition (Admin) - 수동 라이프사이클 전환
    const lifecycleTransitionFn = new NodejsFunction(this, 'LifecycleTransitionFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-challenge-lifecycle-transition`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/lifecycle-transition/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadWriteData(lifecycleTransitionFn);
    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}/lifecycle',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('AdminLifecycleTransitionIntegration', lifecycleTransitionFn),
    });

    // 5. List Users (Admin)
    const listUsersFn = new NodejsFunction(this, 'ListUsersFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-user-list`,
      entry: path.join(__dirname, '../../backend/services/admin/user/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    usersTable.grantReadData(listUsersFn);
    apiGateway.addRoutes({
      path: '/admin/users',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListUsersIntegration', listUsersFn),
    });

    // 6. Stats Overview (Admin)
    const statsFn = new NodejsFunction(this, 'StatsFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-stats`,
      entry: path.join(__dirname, '../../backend/services/admin/stats/overview/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    usersTable.grantReadData(statsFn);
    challengesTable.grantReadData(statsFn);
    userChallengesTable.grantReadData(statsFn);
    apiGateway.addRoutes({
      path: '/admin/stats',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminStatsIntegration', statsFn),
    });
  }
}
