import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import { join } from 'node:path';
import { StatefulStack } from './stateful-stack';
import { StageConfig } from '../config/stages';

export interface ApiStackProps extends cdk.StackProps {
  config: StageConfig;
  stateful: StatefulStack;
  eventBus: events.EventBus;
}

/**
 * HTTP API + 도메인 프리픽스 프록시 라우트 (REDESIGN_PLAN §3.2).
 * Phase 1: user-api 수직 관통. Phase 2~3에서 도메인 Lambda가 같은 패턴으로 추가된다.
 * 노출 표면 3분류: 보호(/u 등, JWT) · 퍼블릭(/auth, /health, /public) · 웹훅(/hooks, 서명검증)
 */
export class ApiStack extends cdk.Stack {
  readonly httpApi: apigwv2.HttpApi;
  readonly userApi: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config, stateful, eventBus } = props;

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `${config.prefix}-api`,
      corsPreflight: {
        allowOrigins: config.cors.allowOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization', 'X-User-Timezone', 'X-Request-Id'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const authorizer = new HttpJwtAuthorizer(
      'CognitoJwt',
      `https://cognito-idp.${this.region}.amazonaws.com/${stateful.userPool.userPoolId}`,
      { jwtAudience: [stateful.userPoolClient.userPoolClientId] },
    );

    this.userApi = new NodejsFunction(this, 'UserApi', {
      functionName: `${config.prefix}-user-api`,
      entry: join(__dirname, '../../services/user-api/src/index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: { minify: true, sourceMap: !config.isProd, externalModules: ['@aws-sdk/*'] },
      environment: {
        STAGE: config.stage,
        USERS_TABLE: stateful.tables.users.tableName,
        USER_POOL_CLIENT_ID: stateful.userPoolClient.userPoolClientId,
        EVENT_BUS_NAME: eventBus.eventBusName,
      },
    });
    // 도메인 격리: user-api에는 users 테이블만 grant (REDESIGN_PLAN §3.1-4)
    stateful.tables.users.grantReadWriteData(this.userApi);
    eventBus.grantPutEventsTo(this.userApi);
    this.userApi.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          'cognito-idp:SignUp',
          'cognito-idp:ConfirmSignUp',
          'cognito-idp:ResendConfirmationCode',
          'cognito-idp:InitiateAuth',
          'cognito-idp:ForgotPassword',
          'cognito-idp:ConfirmForgotPassword',
        ],
        resources: [stateful.userPool.userPoolArn],
      }),
    );

    const userIntegration = new HttpLambdaIntegration('UserApiIntegration', this.userApi);

    // 보호 라우트 (JWT)
    this.httpApi.addRoutes({
      path: '/u/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: userIntegration,
      authorizer,
    });
    // 퍼블릭 라우트
    this.httpApi.addRoutes({
      path: '/auth/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: userIntegration,
    });
    this.httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: userIntegration,
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
  }
}
