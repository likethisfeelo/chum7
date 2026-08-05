import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import {
  HttpLambdaIntegration,
  WebSocketLambdaIntegration,
} from 'aws-cdk-lib/aws-apigatewayv2-integrations';
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

/**
 * 프록시 라우트에 등록할 메서드 — OPTIONS 제외(프리플라이트는 API Gateway가 자동 처리).
 * HEAD 제외: 사용처가 없고, 라우트×메서드마다 Lambda 리소스 정책 문장이 1개씩 쌓여
 * 20KB 한도(AWS::Lambda::Permission)를 넘기던 원인 중 하나였다. (route별 권한 누적 이슈)
 */
const PROXY_METHODS = [
  apigwv2.HttpMethod.GET,
  apigwv2.HttpMethod.POST,
  apigwv2.HttpMethod.PUT,
  apigwv2.HttpMethod.PATCH,
  apigwv2.HttpMethod.DELETE,
];

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
  challengeApi!: NodejsFunction;
  gamificationApi!: NodejsFunction;
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
      publicPrefixes: ['/auth', '/public/users', '/public/push'],
      environment: {
        USERS_TABLE: stateful.tables.users.tableName,
        GRAPH_TABLE: stateful.tables.graph.tableName,
        USER_POOL_CLIENT_ID: stateful.userPoolClient.userPoolClientId,
        VAPID_SECRET_NAME: stateful.vapidSecret.secretName,
        UPLOADS_BUCKET: stateful.uploadsBucket.bucketName,
        // 관계 아카이브 전체 콘텐츠(P3 단계 E) 글로벌 스위치
        ARCHIVE_FULL_CONTENT_ENABLED: String(config.archiveFullContentEnabled ?? false),
        // 친구 기능(v2) — 순차 출시 스위치 + 자격 임계값(각 방향)
        FRIENDS_ENABLED: String(config.friendsEnabled ?? false),
        FRIEND_ELIGIBILITY_THRESHOLD: String(config.friendEligibilityThreshold ?? 100),
        // 소셜 로그인 — 프론트가 GET /auth/social/config 로 읽어 팝업 authorize URL을 구성
        COGNITO_HOSTED_UI_DOMAIN: stateful.hostedUiBaseUrl ?? '',
        SOCIAL_LOGIN_PROVIDERS: stateful.socialProviders.join(','),
      },
    });
    stateful.vapidSecret.grantRead(this.userApi); // GET /public/push/key
    stateful.uploadsBucket.grantPut(this.userApi); // 자유글 이미지 presigned PUT
    stateful.uploadsBucket.grantRead(this.userApi); // 이미지 presigned GET
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

    // --- challenge-api: /c + /public/challenges ---
    this.challengeApi = this.addDomainApi({
      name: 'challenge-api',
      protectedPrefix: '/c',
      publicPrefixes: ['/public/challenges'],
      environment: {
        CHALLENGES_TABLE: stateful.tables.challenges.tableName,
        UPLOADS_BUCKET: stateful.uploadsBucket.bucketName,
        COMMERCE_TABLE: stateful.tables.commerce.tableName,
        // 공유 링크 OG 페이지가 사람을 SPA(/preview/:id)로 되돌릴 앱 오리진. prod에서만 커스텀 도메인.
        APP_ORIGIN: config.domain ? `https://${config.domain.app}` : '',
        // 인증글 작성자 일일 활동명 생성용 (social-api와 동일 salt·알고리즘 공유)
        ANON_ID_SALT_SECRET_NAME: stateful.anonSaltSecret.secretName,
        // 조기완료 자동응원 레코드 생성용 — cheer 테이블 쓰기 (문서화된 크로스 도메인 예외)
        CHEER_TABLE: stateful.tables.cheer.tableName,
      },
    });
    stateful.tables.challenges.grantReadWriteData(this.challengeApi);
    stateful.uploadsBucket.grantPut(this.challengeApi); // presigned PUT 서명용
    stateful.uploadsBucket.grantRead(this.challengeApi);
    stateful.anonSaltSecret.grantRead(this.challengeApi); // 인증글 일일 활동명 생성
    // 유료 참여 시 paid 주문 검증 — 읽기 전용 (COMMERCE_V0.md)
    stateful.tables.commerce.grantReadData(this.challengeApi);
    // 조기완료 시 미완료 팀원에게 자동응원 레코드 생성 (cheer-scheduler가 발송·감사점수 처리)
    stateful.tables.cheer.grantWriteData(this.challengeApi);
    eventBus.grantPutEventsTo(this.challengeApi);

    // --- commerce-api: /pay (쿠폰·수동 입금 — 커머스 v0) ---
    const commerceApi = this.addDomainApi({
      name: 'commerce-api',
      protectedPrefix: '/pay',
      environment: {
        COMMERCE_TABLE: stateful.tables.commerce.tableName,
        CHALLENGES_TABLE: stateful.tables.challenges.tableName,
        OPS_TABLE: stateful.tables.ops.tableName,
      },
    });
    stateful.tables.commerce.grantReadWriteData(commerceApi);
    stateful.tables.challenges.grantReadData(commerceApi); // 가격·모집 상태 확인
    stateful.tables.ops.grantWriteData(commerceApi); // 금전 감사 로그
    eventBus.grantPutEventsTo(commerceApi);

    // --- social-api: /s + /public/plaza·board·hashtags ---
    const socialApi = this.addDomainApi({
      name: 'social-api',
      protectedPrefix: '/s',
      publicPrefixes: ['/public/plaza', '/public/board', '/public/hashtags'],
      environment: {
        SOCIAL_TABLE: stateful.tables.social.tableName,
        UPLOADS_BUCKET: stateful.uploadsBucket.bucketName,
        // 익명 활동명 솔트 — 보드·인증 댓글 익명 ID 생성에 필수 (미주입 시 500/폴백)
        ANON_ID_SALT_SECRET_NAME: stateful.anonSaltSecret.secretName,
        // 리더 모드 댓글 검증용 단일키 조회(스캔 아님) — 리더 판별 전용
        CHALLENGES_TABLE: stateful.tables.challenges.tableName,
      },
    });
    stateful.tables.social.grantReadWriteData(socialApi);
    stateful.uploadsBucket.grantRead(socialApi); // 미디어 URL 재서명
    stateful.uploadsBucket.grantPut(socialApi); // 운영자 마당 게시물 이미지 presigned PUT
    stateful.anonSaltSecret.grantRead(socialApi); // 익명 ID 솔트 로드
    stateful.tables.challenges.grantReadData(socialApi); // 리더 검증 GetItem 전용
    eventBus.grantPutEventsTo(socialApi);

    // --- cheer-api: /ch (challenges 읽기 전용 — porting-guide §4 예외) ---
    const cheerApi = this.addDomainApi({
      name: 'cheer-api',
      protectedPrefix: '/ch',
      environment: {
        CHEER_TABLE: stateful.tables.cheer.tableName,
        CHALLENGES_TABLE: stateful.tables.challenges.tableName,
      },
    });
    stateful.tables.cheer.grantReadWriteData(cheerApi);
    stateful.tables.challenges.grantReadData(cheerApi);
    eventBus.grantPutEventsTo(cheerApi);

    // --- gamification-api: /g + /public/today + /public/banners ---
    this.gamificationApi = this.addDomainApi({
      name: 'gamification-api',
      protectedPrefix: '/g',
      publicPrefixes: ['/public/today', '/public/banners'],
      environment: {
        GAMIFICATION_TABLE: stateful.tables.gamification.tableName,
        CONTENT_TABLE: stateful.tables.content.tableName,
        CHALLENGES_TABLE: stateful.tables.challenges.tableName,
      },
    });
    stateful.tables.gamification.grantReadWriteData(this.gamificationApi);
    stateful.tables.content.grantReadData(this.gamificationApi);
    // 문서화된 크로스 도메인 예외: world-summary 당일 공개 인증 집계 (porting-guide §4)
    stateful.tables.challenges.grantReadData(this.gamificationApi);
    eventBus.grantPutEventsTo(this.gamificationApi);

    // --- admin-api: /adm (운영 콘솔 — admins/operators/creators 그룹 격리) ---
    const adminApi = this.addDomainApi({
      name: 'admin-api',
      protectedPrefix: '/adm',
      memorySize: 512,
      environment: {
        USERS_TABLE: stateful.tables.users.tableName,
        CHALLENGES_TABLE: stateful.tables.challenges.tableName,
        CHEER_TABLE: stateful.tables.cheer.tableName,
        CONTENT_TABLE: stateful.tables.content.tableName,
        OPS_TABLE: stateful.tables.ops.tableName,
        UPLOADS_BUCKET: stateful.uploadsBucket.bucketName,
      },
    });
    stateful.tables.users.grantReadData(adminApi);
    stateful.tables.challenges.grantReadWriteData(adminApi);
    stateful.tables.cheer.grantReadWriteData(adminApi); // DLQ 재처리
    stateful.tables.content.grantReadWriteData(adminApi); // 배너 관리
    stateful.tables.ops.grantReadWriteData(adminApi); // 감사 로그
    stateful.uploadsBucket.grantPut(adminApi); // 배너 이미지 presigned PUT
    eventBus.grantPutEventsTo(adminApi);

    // --- chat-api: 챌린지 단체 채팅 WebSocket API (HTTP API와 별개 엔드포인트) ---
    // WebSocket 은 JWT authorizer 를 못 쓰므로 토큰 검증은 $connect 핸들러가 직접 수행한다.
    const chatWs = new NodejsFunction(this, 'ChatApi', {
      functionName: `${config.prefix}-chat-api`,
      entry: join(__dirname, '../../services/chat-api/src/index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: { minify: true, sourceMap: !config.isProd, externalModules: ['@aws-sdk/*'] },
      environment: {
        ...this.commonEnv,
        CHAT_TABLE: stateful.tables.chat.tableName,
        CHALLENGES_TABLE: stateful.tables.challenges.tableName,
        USER_POOL_ID: stateful.userPool.userPoolId,
        USER_POOL_CLIENT_ID: stateful.userPoolClient.userPoolClientId,
        ANON_ID_SALT_SECRET_NAME: stateful.anonSaltSecret.secretName,
      },
    });
    this.functions.push(chatWs);
    stateful.tables.chat.grantReadWriteData(chatWs); // 연결 레지스트리 + 메시지
    stateful.tables.challenges.grantReadData(chatWs); // 참여자 검증 GetItem 전용
    stateful.anonSaltSecret.grantRead(chatWs); // 일일 활동명 솔트

    // 라우트마다 별도 integration 인스턴스 — 하나를 재사용하면 CDK가 Lambda 호출 권한
    // (AWS::Lambda::Permission)을 첫 라우트($connect)에만 생성해, 나머지 라우트는 API GW가
    // Lambda를 호출하지 못하고 "Internal server error"를 반환한다. 각 인스턴스가 자기 라우트
    // 스코프의 권한을 emit하도록 분리한다.
    const chatInteg = (id: string) => new WebSocketLambdaIntegration(id, chatWs);
    const chatWsApi = new apigwv2.WebSocketApi(this, 'ChatWebSocketApi', {
      apiName: `${config.prefix}-chat-ws`,
      routeSelectionExpression: '$request.body.action',
      connectRouteOptions: { integration: chatInteg('ChatWsConnect') },
      disconnectRouteOptions: { integration: chatInteg('ChatWsDisconnect') },
      defaultRouteOptions: { integration: chatInteg('ChatWsDefault') }, // {action:'history'} 등
    });
    chatWsApi.addRoute('sendMessage', { integration: chatInteg('ChatWsSend') });
    const chatWsStage = new apigwv2.WebSocketStage(this, 'ChatWebSocketStage', {
      webSocketApi: chatWsApi,
      stageName: config.stage,
      autoDeploy: true,
    });
    chatWsApi.grantManageConnections(chatWs); // execute-api:ManageConnections (postToConnection)
    new cdk.CfnOutput(this, 'ChatWebSocketUrl', { value: chatWsStage.url }); // wss://...

    // --- API 커스텀 도메인 (config.domain 설정 시 — Phase 5 전환) ---
    if (config.domain) {
      const zone = cdk.aws_route53.HostedZone.fromLookup(this, 'ApiZone', {
        domainName: config.domain.zoneName,
      });
      // API Gateway 리전 도메인용 인증서는 같은 리전(ACM) — CloudFront용(us-east-1)과 별개
      const apiCert = new cdk.aws_certificatemanager.Certificate(this, 'ApiCertificate', {
        domainName: config.domain.api,
        validation: cdk.aws_certificatemanager.CertificateValidation.fromDns(zone),
      });
      const apiDomain = new apigwv2.DomainName(this, 'ApiDomain', {
        domainName: config.domain.api,
        certificate: apiCert,
      });
      new apigwv2.ApiMapping(this, 'ApiMapping', {
        api: this.httpApi,
        domainName: apiDomain,
        stage: this.httpApi.defaultStage!,
      });
      new cdk.aws_route53.ARecord(this, 'ApiAlias', {
        zone,
        recordName: config.domain.api,
        target: cdk.aws_route53.RecordTarget.fromAlias(
          new cdk.aws_route53_targets.ApiGatewayv2DomainProperties(
            apiDomain.regionalDomainName,
            apiDomain.regionalHostedZoneId,
          ),
        ),
        deleteExisting: true, // 구 시스템 수동 레코드 대체 (DNS 전환)
      });
      new cdk.CfnOutput(this, 'ApiCustomDomain', { value: `https://${config.domain.api}` });
    }

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
    // ANY는 OPTIONS까지 포함해 프리플라이트를 Lambda로 넘겨버린다(→ Hono 404 → CORS 실패).
    // OPTIONS를 제외한 실제 메서드만 등록하면, OPTIONS 라우트가 없어 API Gateway가
    // corsPreflight 설정으로 프리플라이트를 자동 응답한다(204 + CORS 헤더).
    //
    // 중요: {proxy+}는 하위 세그먼트 1개 이상을 요구해 "맨 경로"(예: GET /public/challenges,
    // Hono의 route('/'))는 매칭하지 못한다 → API GW 404. 따라서 정확 경로와 프록시 경로를
    // 둘 다 등록한다(목록/피드 등 루트 핸들러가 죽지 않도록).
    this.httpApi.addRoutes({
      path: spec.protectedPrefix,
      methods: PROXY_METHODS,
      integration,
      authorizer: this.authorizer,
    });
    this.httpApi.addRoutes({
      path: `${spec.protectedPrefix}/{proxy+}`,
      methods: PROXY_METHODS,
      integration,
      authorizer: this.authorizer,
    });
    for (const publicPrefix of spec.publicPrefixes ?? []) {
      this.httpApi.addRoutes({
        path: publicPrefix,
        methods: PROXY_METHODS,
        integration,
      });
      this.httpApi.addRoutes({
        path: `${publicPrefix}/{proxy+}`,
        methods: PROXY_METHODS,
        integration,
      });
    }
    return fn;
  }
}

function pascal(input: string): string {
  return input.replace(/(^|[-_])(\w)/g, (_, __, ch: string) => ch.toUpperCase());
}
