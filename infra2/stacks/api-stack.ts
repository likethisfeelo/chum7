import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as iam from 'aws-cdk-lib/aws-iam';
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

interface DomainApiSpec {
  /** services/<name>/src/index.ts */
  name: string;
  /** JWT 보호 프리픽스 (contracts API_PREFIXES와 일치) */
  protectedPrefix: string;
  /** authorizer 없는 퍼블릭 프리픽스 (예: /auth, /public/challenges) */
  publicPrefixes?: string[];
  environment?: Record<string, string>;
  memorySize?: number;
}

/**
 * HTTP API + 도메인 프리픽스 프록시 라우트 (REDESIGN_PLAN §3.2).
 * 도메인 추가 = addDomainApi() 호출 1개 + grant — 엔드포인트 추가는 CDK 변경 불필요.
 * 노출 표면 3분류: 보호(JWT) · 퍼블릭(/auth, /health, /public/*) · 웹훅(/hooks — Phase 3)
 */
export class ApiStack extends cdk.Stack {
  readonly httpApi: apigwv2.HttpApi;
  readonly userApi: NodejsFunction;
  readonly challengeApi?: NodejsFunction;
  readonly gamificationApi?: NodejsFunction;
  readonly functions: NodejsFunction[] = [];

  private readonly authorizer: HttpJwtAuthorizer;
  private readonly config: StageConfig;
  private readonly commonEnv: Record<string, string>;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config, stateful, eventBus } = props;
    this.config = config;

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `${config.prefix}-api`,
      corsPreflight: {
        allowOrigins: config.cors.allowOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization', 'X-User-Timezone', 'X-Request-Id'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    this.authorizer = new HttpJwtAuthorizer(
      'CognitoJwt',
      `https://cognito-idp.${this.region}.amazonaws.com/${stateful.userPool.userPoolId}`,
      { jwtAudience: [stateful.userPoolClient.userPoolClientId] },
    );

    this.commonEnv = {
      STAGE: config.stage,
      EVENT_BUS_NAME: eventBus.eventBusName,
    };

    // --- user-api: /u + /auth + /health ---
    this.userApi = this.addDomainApi({
      name: 'user-api',
      protectedPrefix: '/u',
      publicPrefixes: ['/auth', '/public/users'],
      environment: {
        USERS_TABLE: stateful.tables.users.tableName,
        GRAPH_TABLE: stateful.tables.graph.tableName,
        USER_POOL_CLIENT_ID: stateful.userPoolClient.userPoolClientId,
      },
    });
    stateful.tables.users.grantReadWriteData(this.userApi);
    stateful.tables.graph.grantReadWriteData(this.userApi);
    eventBus.grantPutEventsTo(this.userApi);
    this.userApi.addToRolePolicy(
      new iam.PolicyStatement({
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
    this.httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('HealthIntegration', this.userApi),
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
  }

  /** 도메인 Lambda 1개 + 프리픽스 프록시 라우트 등록 (grant는 호출부에서 명시) */
  addDomainApi(spec: DomainApiSpec): NodejsFunction {
    const fn = new NodejsFunction(this, pascal(spec.name), {
      functionName: `${this.config.prefix}-${spec.name}`,
      entry: join(__dirname, `../../services/${spec.name}/src/index.ts`),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: spec.memorySize ?? 256,
      bundling: { minify: true, sourceMap: !this.config.isProd, externalModules: ['@aws-sdk/*'] },
      environment: { ...this.commonEnv, ...spec.environment },
    });
    this.functions.push(fn);

    const integration = new HttpLambdaIntegration(`${pascal(spec.name)}Integration`, fn);
    this.httpApi.addRoutes({
      path: `${spec.protectedPrefix}/{proxy+}`,
      methods: [apigwv2.HttpMethod.ANY],
      integration,
      authorizer: this.authorizer,
    });
    for (const publicPrefix of spec.publicPrefixes ?? []) {
      this.httpApi.addRoutes({
        path: `${publicPrefix}/{proxy+}`,
        methods: [apigwv2.HttpMethod.ANY],
        integration,
      });
    }
    return fn;
  }
}

function pascal(input: string): string {
  return input.replace(/(^|[-_])(\w)/g, (_, __, ch: string) => ch.toUpperCase());
}
