/**
 * Quest Stack
 *
 * 퀘스트 보드 API:
 *   Admin:
 *     POST /admin/quests                                  - 퀘스트 생성
 *     PUT  /admin/quests/submissions/{submissionId}/review - 제출물 승인/거절
 *
 *   User:
 *     GET  /quests                         - 퀘스트 목록 (?challengeId=&status=)
 *     POST /quests/{questId}/submit        - 퀘스트 제출
 *     GET  /quests/my-submissions          - 내 제출 내역 (?includeHistory=true)
 *
 * 2-테이블 패턴:
 *   questSubmissionsTable       → 전체 이력 (append-only)
 *   activeQuestSubmissionsTable → 현재 상태 + 유니크 보장
 */
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

interface QuestStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  questsTable: Table;
  questSubmissionsTable: Table;
  activeQuestSubmissionsTable: Table;
  challengesTable: Table;
}

export class QuestStack extends Stack {
  constructor(scope: Construct, id: string, props: QuestStackProps) {
    super(scope, id, props);

    const {
      stage, apiGateway, authorizer,
      questsTable, questSubmissionsTable, activeQuestSubmissionsTable, challengesTable,
    } = props;

    const commonEnv = {
      STAGE:                           stage,
      QUESTS_TABLE:                    questsTable.tableName,
      QUEST_SUBMISSIONS_TABLE:         questSubmissionsTable.tableName,
      ACTIVE_QUEST_SUBMISSIONS_TABLE:  activeQuestSubmissionsTable.tableName,
      CHALLENGES_TABLE:                challengesTable.tableName,
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

    // 1. Admin: Create Quest
    const createQuestFn = new NodejsFunction(this, 'CreateQuestFn', {
      ...commonProps,
      functionName: `chme-${stage}-quest-create`,
      entry: path.join(__dirname, '../../backend/services/quest/create/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    questsTable.grantWriteData(createQuestFn);
    challengesTable.grantReadData(createQuestFn);
    apiGateway.addRoutes({
      path: '/admin/quests',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('AdminCreateQuestIntegration', createQuestFn),
      authorizer,
    });

    // 2. User: List Quests (현재 제출 상태 포함) (protected)
    const listQuestsFn = new NodejsFunction(this, 'ListQuestsFn', {
      ...commonProps,
      functionName: `chme-${stage}-quest-list`,
      entry: path.join(__dirname, '../../backend/services/quest/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    questsTable.grantReadData(listQuestsFn);
    activeQuestSubmissionsTable.grantReadData(listQuestsFn);
    apiGateway.addRoutes({
      path: '/quests',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListQuestsIntegration', listQuestsFn),
      authorizer,
    });

    // 3. User: Submit Quest (protected)
    const submitQuestFn = new NodejsFunction(this, 'SubmitQuestFn', {
      ...commonProps,
      functionName: `chme-${stage}-quest-submit`,
      entry: path.join(__dirname, '../../backend/services/quest/submit/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    questsTable.grantReadWriteData(submitQuestFn);
    questSubmissionsTable.grantReadWriteData(submitQuestFn);
    activeQuestSubmissionsTable.grantReadWriteData(submitQuestFn);
    apiGateway.addRoutes({
      path: '/quests/{questId}/submit',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SubmitQuestIntegration', submitQuestFn),
      authorizer,
    });

    // 4. Admin: Review (Approve / Reject) (protected)
    const approveQuestFn = new NodejsFunction(this, 'ApproveQuestFn', {
      ...commonProps,
      functionName: `chme-${stage}-quest-approve`,
      entry: path.join(__dirname, '../../backend/services/quest/approve/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    questsTable.grantReadWriteData(approveQuestFn);
    questSubmissionsTable.grantReadWriteData(approveQuestFn);
    activeQuestSubmissionsTable.grantReadWriteData(approveQuestFn);
    apiGateway.addRoutes({
      path: '/admin/quests/submissions/{submissionId}/review',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('ApproveQuestIntegration', approveQuestFn),
      authorizer,
    });

    // 5. Admin: List Submissions (pending 큐 + 퀘스트별 필터) (protected)
    const adminListSubmissionsFn = new NodejsFunction(this, 'AdminListSubmissionsFn', {
      ...commonProps,
      functionName: `chme-${stage}-quest-admin-list-submissions`,
      entry: path.join(__dirname, '../../backend/services/quest/admin-list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    questSubmissionsTable.grantReadData(adminListSubmissionsFn);
    questsTable.grantReadData(adminListSubmissionsFn);
    apiGateway.addRoutes({
      path: '/admin/quests/submissions',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('AdminListSubmissionsIntegration', adminListSubmissionsFn),
      authorizer,
    });

    // 6. User: My Submissions (현재 상태 or 전체 이력) (protected)
    const mySubmissionsFn = new NodejsFunction(this, 'MySubmissionsFn', {
      ...commonProps,
      functionName: `chme-${stage}-quest-my-submissions`,
      entry: path.join(__dirname, '../../backend/services/quest/my-submissions/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    questSubmissionsTable.grantReadData(mySubmissionsFn);
    activeQuestSubmissionsTable.grantReadData(mySubmissionsFn);
    questsTable.grantReadData(mySubmissionsFn);
    apiGateway.addRoutes({
      path: '/quests/my-submissions',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('MySubmissionsIntegration', mySubmissionsFn),
      authorizer,
    });
  }
}
