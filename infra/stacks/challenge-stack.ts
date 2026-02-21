import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

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

    const commonEnv = {
      STAGE: stage,
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

    // 3. Join Challenge
    const joinFn = new NodejsFunction(this, 'JoinFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-join`,
      entry: path.join(__dirname, '../../backend/services/challenge/join/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    challengesTable.grantReadData(joinFn);
    userChallengesTable.grantReadWriteData(joinFn);
    apiGateway.addRoutes({
      path: '/challenges/{challengeId}/join',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ChallengeJoinIntegration', joinFn),
    });

    // 4. My Challenges
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
  }
}
