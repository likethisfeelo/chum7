// infra/stacks/challenge-stack.ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

export interface ChallengeStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  challengesTable: Table;
  userChallengesTable: Table;
}

export class ChallengeStack extends Stack {
  constructor(scope: Construct, id: string, props: ChallengeStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, challengesTable, userChallengesTable } = props;

    const commonEnv = {
      STAGE: stage,
      CHALLENGES_TABLE: challengesTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
    };

    // ==================== List Challenges Lambda ====================
    const listFunction = new NodejsFunction(this, 'ListFunction', {
      functionName: `chme-${stage}-challenge-list`,
      entry: path.join(__dirname, '../../backend/services/challenge/list/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadData(listFunction);

    apiGateway.addRoutes({
      path: '/challenges',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ChallengeListIntegration', listFunction),
    });

    // ==================== Get Challenge Detail Lambda ====================
    const detailFunction = new NodejsFunction(this, 'DetailFunction', {
      functionName: `chme-${stage}-challenge-detail`,
      entry: path.join(__dirname, '../../backend/services/challenge/detail/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadData(detailFunction);

    apiGateway.addRoutes({
      path: '/challenges/{challengeId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ChallengeDetailIntegration', detailFunction),
    });

    // ==================== Join Challenge Lambda ====================
    const joinFunction = new NodejsFunction(this, 'JoinFunction', {
      functionName: `chme-${stage}-challenge-join`,
      entry: path.join(__dirname, '../../backend/services/challenge/join/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadData(joinFunction);
    userChallengesTable.grantReadWriteData(joinFunction);

    apiGateway.addRoutes({
      path: '/challenges/{challengeId}/join',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ChallengeJoinIntegration', joinFunction),
    });

    // ==================== My Challenges Lambda ====================
    const myChallengesFunction = new NodejsFunction(this, 'MyChallengesFunction', {
      functionName: `chme-${stage}-challenge-my`,
      entry: path.join(__dirname, '../../backend/services/challenge/my-challenges/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    userChallengesTable.grantReadData(myChallengesFunction);
    challengesTable.grantReadData(myChallengesFunction);

    apiGateway.addRoutes({
      path: '/challenges/my',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('MyChallengesIntegration', myChallengesFunction),
    });

    // ==================== Challenge Stats Lambda ====================
    const statsFunction = new NodejsFunction(this, 'StatsFunction', {
      functionName: `chme-${stage}-challenge-stats`,
      entry: path.join(__dirname, '../../backend/services/challenge/stats/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
    });

    challengesTable.grantReadData(statsFunction);
    userChallengesTable.grantReadData(statsFunction);

    apiGateway.addRoutes({
      path: '/challenges/{challengeId}/stats',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ChallengeStatsIntegration', statsFunction),
    });
  }
}
