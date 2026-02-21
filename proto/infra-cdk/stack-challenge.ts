// infra/stacks/challenge-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';

interface ChallengeStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  challengesTable: Table;
  userChallengesTable: Table;
}

export class ChallengeStack extends Stack {
  constructor(scope: Construct, id: string, props: ChallengeStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, challengesTable, userChallengesTable } = props;

    const commonLambdaProps = {
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        STAGE: stage,
        CHALLENGES_TABLE: challengesTable.tableName,
        USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
    };

    // ==================== 1. List Challenges ====================
    const listFunction = new NodejsFunction(this, 'ListFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-challenge-list`,
      entry: '../backend/services/challenge/list/index.ts',
      handler: 'handler',
    });
    challengesTable.grantReadData(listFunction);

    apiGateway.addRoutes({
      path: '/challenges',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListIntegration', listFunction),
    });

    // ==================== 2. Challenge Detail ====================
    const detailFunction = new NodejsFunction(this, 'DetailFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-challenge-detail`,
      entry: '../backend/services/challenge/detail/index.ts',
      handler: 'handler',
    });
    challengesTable.grantReadData(detailFunction);

    apiGateway.addRoutes({
      path: '/challenges/{challengeId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('DetailIntegration', detailFunction),
    });

    // ==================== 3. Join Challenge ====================
    const joinFunction = new NodejsFunction(this, 'JoinFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-challenge-join`,
      entry: '../backend/services/challenge/join/index.ts',
      handler: 'handler',
    });
    challengesTable.grantReadData(joinFunction);
    userChallengesTable.grantWriteData(joinFunction);

    apiGateway.addRoutes({
      path: '/challenges/{challengeId}/join',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('JoinIntegration', joinFunction),
    });

    // ==================== 4. My Challenges ====================
    const myChallengesFunction = new NodejsFunction(this, 'MyChallengesFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-challenge-my`,
      entry: '../backend/services/challenge/my-challenges/index.ts',
      handler: 'handler',
    });
    userChallengesTable.grantReadData(myChallengesFunction);
    challengesTable.grantReadData(myChallengesFunction);

    apiGateway.addRoutes({
      path: '/challenges/my',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('MyChallengesIntegration', myChallengesFunction),
    });

    // ==================== 5. Challenge Stats ====================
    const statsFunction = new NodejsFunction(this, 'StatsFunction', {
      ...commonLambdaProps,
      functionName: `chme-${stage}-challenge-stats`,
      entry: '../backend/services/challenge/stats/index.ts',
      handler: 'handler',
    });
    challengesTable.grantReadData(statsFunction);
    userChallengesTable.grantReadData(statsFunction);

    apiGateway.addRoutes({
      path: '/challenges/{challengeId}/stats',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('StatsIntegration', statsFunction),
    });
  }
}
