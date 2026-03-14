import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

interface BadgeStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  badgesTable: Table;
}

export class BadgeStack extends Stack {
  constructor(scope: Construct, id: string, props: BadgeStackProps) {
    super(scope, id, props);

    const { stage, apiGateway, authorizer, badgesTable } = props;

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

    const commonEnv = {
      STAGE: stage,
      BADGES_TABLE: badgesTable.tableName,
    };

    const listBadgesFn = new NodejsFunction(this, 'ListBadgesFn', {
      ...commonProps,
      functionName: `chme-${stage}-badge-list`,
      entry: path.join(__dirname, '../../backend/services/badge/list/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    badgesTable.grantReadData(listBadgesFn);

    apiGateway.addRoutes({
      path: '/users/me/badges',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('BadgeListIntegration', listBadgesFn),
      authorizer,
    });

    // NOTE:
    // badge grant는 verification submit 서버 경로에서만 수행하며
    // 클라이언트가 직접 호출 가능한 공개 라우트는 제공하지 않는다.
    // (임의 파라미터로 self-grant 시도 가능성 방지)
  }
}
