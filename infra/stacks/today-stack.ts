import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

interface TodayStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  userChallengesTable: Table;
  challengesTable: Table;
  verificationsTable: Table;
}

export class TodayStack extends Stack {
  constructor(scope: Construct, id: string, props: TodayStackProps) {
    super(scope, id, props);

    const {
      stage, apiGateway, authorizer,
      userChallengesTable, challengesTable, verificationsTable,
    } = props;

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

    // GET /today/world-summary — 8층 월드 점수 요약
    const worldSummaryFn = new NodejsFunction(this, 'TodayWorldSummaryFn', {
      ...commonProps,
      functionName: `chme-${stage}-today-world-summary`,
      entry: path.join(__dirname, '../../backend/services/today/world-summary/index.ts'),
      handler: 'handler',
      environment: {
        STAGE: stage,
        USER_CHALLENGES_TABLE: userChallengesTable.tableName,
        CHALLENGES_TABLE: challengesTable.tableName,
        VERIFICATIONS_TABLE: verificationsTable.tableName,
      },
    });

    userChallengesTable.grantReadData(worldSummaryFn);
    challengesTable.grantReadData(worldSummaryFn);
    verificationsTable.grantReadData(worldSummaryFn);

    apiGateway.addRoutes({
      path: '/today/world-summary',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('TodayWorldSummaryIntegration', worldSummaryFn),
      authorizer,
    });
  }
}
