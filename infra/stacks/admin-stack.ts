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
  cheersTable: Table;
  cheerDeadLettersTable: Table;
  challengesTable: Table;
  userChallengesTable: Table;
  questSubmissionsTable: Table;
  verificationsTable: Table;
  personalQuestProposalsTable: Table;
  notificationsTable: Table;
  categoryBannersTable: Table;
}

export class AdminStack extends Stack {
  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    const {
      stage,
      apiGateway,
      authorizer,
      usersTable,
      cheersTable,
      cheerDeadLettersTable,
      challengesTable,
      userChallengesTable,
      questSubmissionsTable,
      verificationsTable,
      personalQuestProposalsTable,
      notificationsTable,
      categoryBannersTable,
    } = props;

    const commonEnv = {
      STAGE: stage,
      USERS_TABLE: usersTable.tableName,
      CHEERS_TABLE: cheersTable.tableName,
      CHEER_DEAD_LETTERS_TABLE: cheerDeadLettersTable.tableName,
      CHALLENGES_TABLE: challengesTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      QUEST_SUBMISSIONS_TABLE: questSubmissionsTable.tableName,
      VERIFICATIONS_TABLE: verificationsTable.tableName,
      PERSONAL_QUEST_PROPOSALS_TABLE: personalQuestProposalsTable.tableName,
      NOTIFICATIONS_TABLE: notificationsTable.tableName,
      CATEGORY_BANNERS_TABLE: categoryBannersTable.tableName,
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

    // 4a. Confirm Start (Admin) - requireStartConfirmation=true 챌린지 수동 시작 확인
    const confirmStartFn = new NodejsFunction(this, 'ConfirmStartFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-challenge-confirm-start`,
      entry: path.join(__dirname, '../../backend/services/admin/challenge/confirm-start/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadWriteData(confirmStartFn);
    userChallengesTable.grantReadWriteData(confirmStartFn);
    personalQuestProposalsTable.grantReadWriteData(confirmStartFn);
    notificationsTable.grantWriteData(confirmStartFn);
    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}/confirm-start',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminConfirmStartIntegration', confirmStartFn),
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


    const personalQuestReviewFn = new NodejsFunction(this, 'PersonalQuestReviewFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-personal-quest-review`,
      entry: path.join(__dirname, '../../backend/services/admin/personal-quest/review/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    personalQuestProposalsTable.grantReadWriteData(personalQuestReviewFn);
    notificationsTable.grantReadWriteData(personalQuestReviewFn);
    apiGateway.addRoutes({
      path: '/admin/personal-quest-proposals/{proposalId}/review',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('AdminPersonalQuestReviewIntegration', personalQuestReviewFn),
      authorizer,
    });

    const personalQuestListFn = new NodejsFunction(this, 'PersonalQuestListFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-personal-quest-list`,
      entry: path.join(__dirname, '../../backend/services/admin/personal-quest/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    personalQuestProposalsTable.grantReadData(personalQuestListFn);
    apiGateway.addRoutes({
      path: '/admin/challenges/{challengeId}/personal-quest-proposals',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminPersonalQuestListIntegration', personalQuestListFn),
      authorizer,
    });

    // 10. Cheer Dead Letters (Ops)
    const cheerDeadLetterListFn = new NodejsFunction(this, 'CheerDeadLetterListFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-cheer-dead-letter-list`,
      entry: path.join(__dirname, '../../backend/services/admin/cheer/dead-letter/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheerDeadLettersTable.grantReadData(cheerDeadLetterListFn);
    apiGateway.addRoutes({
      path: '/admin/cheer/dead-letters',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminCheerDeadLetterListIntegration', cheerDeadLetterListFn),
      authorizer,
    });



    const cheerDeadLetterStatsFn = new NodejsFunction(this, 'CheerDeadLetterStatsFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-cheer-dead-letter-stats`,
      entry: path.join(__dirname, '../../backend/services/admin/cheer/dead-letter/stats/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheerDeadLettersTable.grantReadData(cheerDeadLetterStatsFn);
    apiGateway.addRoutes({
      path: '/admin/cheer/dead-letters/stats',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminCheerDeadLetterStatsIntegration', cheerDeadLetterStatsFn),
      authorizer,
    });

    const cheerDeadLetterGetFn = new NodejsFunction(this, 'CheerDeadLetterGetFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-cheer-dead-letter-get`,
      entry: path.join(__dirname, '../../backend/services/admin/cheer/dead-letter/get/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheerDeadLettersTable.grantReadData(cheerDeadLetterGetFn);
    cheersTable.grantReadData(cheerDeadLetterGetFn);
    apiGateway.addRoutes({
      path: '/admin/cheer/dead-letters/{cheerId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminCheerDeadLetterGetIntegration', cheerDeadLetterGetFn),
      authorizer,
    });

    const cheerDeadLetterRequeueFn = new NodejsFunction(this, 'CheerDeadLetterRequeueFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-cheer-dead-letter-requeue`,
      entry: path.join(__dirname, '../../backend/services/admin/cheer/dead-letter/requeue/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheerDeadLettersTable.grantReadWriteData(cheerDeadLetterRequeueFn);
    cheersTable.grantReadWriteData(cheerDeadLetterRequeueFn);
    apiGateway.addRoutes({
      path: '/admin/cheer/dead-letters/{cheerId}/requeue',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminCheerDeadLetterRequeueIntegration', cheerDeadLetterRequeueFn),
      authorizer,
    });



    const cheerDeadLetterRequeueByQueryFn = new NodejsFunction(this, 'CheerDeadLetterRequeueByQueryFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-cheer-dead-letter-requeue-by-query`,
      entry: path.join(__dirname, '../../backend/services/admin/cheer/dead-letter/requeue-by-query/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheerDeadLettersTable.grantReadWriteData(cheerDeadLetterRequeueByQueryFn);
    cheersTable.grantReadWriteData(cheerDeadLetterRequeueByQueryFn);
    apiGateway.addRoutes({
      path: '/admin/cheer/dead-letters/requeue-by-query',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminCheerDeadLetterRequeueByQueryIntegration', cheerDeadLetterRequeueByQueryFn),
      authorizer,
    });

    const cheerDeadLetterBatchRequeueFn = new NodejsFunction(this, 'CheerDeadLetterBatchRequeueFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-cheer-dead-letter-requeue-batch`,
      entry: path.join(__dirname, '../../backend/services/admin/cheer/dead-letter/requeue-batch/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    cheerDeadLettersTable.grantReadWriteData(cheerDeadLetterBatchRequeueFn);
    cheersTable.grantReadWriteData(cheerDeadLetterBatchRequeueFn);
    apiGateway.addRoutes({
      path: '/admin/cheer/dead-letters/requeue-batch',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminCheerDeadLetterBatchRequeueIntegration', cheerDeadLetterBatchRequeueFn),
      authorizer,
    });

    // ── Category Banners (Admin) ──────────────────────────────────────────────

    const categoryBannerListFn = new NodejsFunction(this, 'AdminCategoryBannerListFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-category-banner-list`,
      entry: path.join(__dirname, '../../backend/services/admin/category-banners/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    categoryBannersTable.grantReadData(categoryBannerListFn);
    apiGateway.addRoutes({
      path: '/admin/category-banners/{slug}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminCategoryBannerListIntegration', categoryBannerListFn),
      authorizer,
    });

    const categoryBannerUpsertFn = new NodejsFunction(this, 'AdminCategoryBannerUpsertFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-category-banner-upsert`,
      entry: path.join(__dirname, '../../backend/services/admin/category-banners/upsert/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    categoryBannersTable.grantWriteData(categoryBannerUpsertFn);
    apiGateway.addRoutes({
      path: '/admin/category-banners/{slug}',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminCategoryBannerUpsertIntegration', categoryBannerUpsertFn),
      authorizer,
    });

    const categoryBannerActivateFn = new NodejsFunction(this, 'AdminCategoryBannerActivateFn', {
      ...commonProps,
      functionName: `chme-${stage}-admin-category-banner-activate`,
      entry: path.join(__dirname, '../../backend/services/admin/category-banners/activate/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    categoryBannersTable.grantReadWriteData(categoryBannerActivateFn);
    apiGateway.addRoutes({
      path: '/admin/category-banners/{slug}/{bannerId}/activate',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('AdminCategoryBannerActivateIntegration', categoryBannerActivateFn),
      authorizer,
    });

  }
}
