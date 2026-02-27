import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

interface AdminStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  usersTable: Table;
  challengesTable: Table;
  userChallengesTable: Table;
  questSubmissionsTable: Table;
  verificationsTable: Table;
}

export class AdminStack extends Stack {
  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    const {
      stage,
      apiGateway,
      authorizer,
      usersTable,
      challengesTable,
      userChallengesTable,
      questSubmissionsTable,
      verificationsTable,
    } = props;

    const commonEnv = {
      STAGE: stage,
      USERS_TABLE: usersTable.tableName,
      CHALLENGES_TABLE: challengesTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      QUEST_SUBMISSIONS_TABLE: questSubmissionsTable.tableName,
      VERIFICATIONS_TABLE: verificationsTable.tableName,
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
      authorizer,
    });

    // 2. Update Challenge (Admin) (protected)
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
      authorizer,
    });

    // 3. Delete Challenge (Admin) (protected)
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
      authorizer,
    });

    // 4. Lifecycle Transition (Admin) - 수동 라이프사이클 전환 (protected)
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
      authorizer,
    });

    // 5. List My Challenges (Admin) (protected)
    const listMyChallengesFn = new NodejsFunction(this, 'ListMyChallengesFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-challenge-list-mine`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/list-mine/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadData(listMyChallengesFn);
    apiGateway.addRoutes({
      path: '/admin/challenges/mine',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListMyChallengesIntegration', listMyChallengesFn),
      authorizer,
    });

    // 6. List All Challenges (Admin) (protected)
    const listAllChallengesFn = new NodejsFunction(this, 'ListAllChallengesFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-challenge-list-all`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/list-all/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadData(listAllChallengesFn);
    apiGateway.addRoutes({
      path: '/admin/challenges/all',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListAllChallengesIntegration', listAllChallengesFn),
      authorizer,
    });

    // 7. List Users (Admin) (protected)
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
      authorizer,
    });

    // 8. Stats Overview (Admin) (protected)
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
    questSubmissionsTable.grantReadData(statsFn);
    verificationsTable.grantReadData(statsFn);
    apiGateway.addRoutes({
      path: '/admin/stats',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminStatsIntegration', statsFn),
      authorizer,
    });
    apiGateway.addRoutes({
      path: '/admin/stats/overview',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminStatsOverviewIntegration', statsFn),
      authorizer,
    });

    // 9. Audit Logs (Admin) (protected)
    const auditLogsFn = new NodejsFunction(this, 'AuditLogsFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-audit-logs`,
      entry: path.join(__dirname, '../../backend/services/admin/audit/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    questSubmissionsTable.grantReadData(auditLogsFn);
    apiGateway.addRoutes({
      path: '/admin/audit/logs',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminAuditLogsIntegration', auditLogsFn),
      authorizer,
    });
  }
}
