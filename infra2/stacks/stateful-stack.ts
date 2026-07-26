import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { StageConfig } from '../config/stages';

export interface StatefulStackProps extends cdk.StackProps {
  config: StageConfig;
}

/**
 * 바운디드 컨텍스트당 1테이블 — REDESIGN_PLAN §3.3의 9개 + chat.
 * chat: 챌린지 단체 채팅(WebSocket 연결 레지스트리 + 임시 메시지). TTL 로 자동 만료돼
 * 다른 도메인과 운영 특성(고빈도 쓰기·짧은 수명)이 달라 별도 테이블로 격리한다.
 */
export const DOMAIN_TABLES = [
  'users',
  'challenges',
  'social',
  'graph',
  'cheer',
  'gamification',
  'content',
  'commerce',
  'ops',
  'chat',
] as const;
export type DomainTable = (typeof DOMAIN_TABLES)[number];

/** 테이블별 GSI 수 (gsi1..n, generic pk/sk) — 액세스 패턴이 늘면 여기서만 조정 */
const GSI_COUNT: Record<DomainTable, number> = {
  users: 1,
  challenges: 2, // 탐색: lifecycle#category / 최신순
  social: 2, // 피드 시간순 / 해시태그
  graph: 2, // 팔로워/팔로잉 양방향
  cheer: 2, // 수신·발신 / 예약분(status+time)
  gamification: 1,
  content: 1,
  commerce: 3, // 주문별 원장 / 크리에이터별 정산 / CI 중복 검사
  ops: 1,
  chat: 0, // 방/연결/메시지 모두 pk 파티션 Query 로 성립 — GSI 불필요
};

/** TTL 속성 `ttl`(epoch seconds)을 켜는 테이블 — 아이템 자동 만료(임시성). */
const TTL_TABLES: Partial<Record<DomainTable, string>> = {
  chat: 'ttl',
};

export class StatefulStack extends cdk.Stack {
  readonly tables: Record<DomainTable, dynamodb.Table>;
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly uploadsBucket: s3.Bucket;
  readonly pgSecret: secretsmanager.Secret;
  readonly identitySecret: secretsmanager.Secret;
  readonly vapidSecret: secretsmanager.Secret;
  readonly anonSaltSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: StatefulStackProps) {
    super(scope, id, props);
    const { config } = props;
    const removalPolicy = config.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // --- DynamoDB: 도메인 테이블 9개 ---
    this.tables = {} as Record<DomainTable, dynamodb.Table>;
    for (const name of DOMAIN_TABLES) {
      const table = new dynamodb.Table(this, `${pascal(name)}Table`, {
        tableName: `${config.prefix}-${name}`,
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: config.isProd },
        timeToLiveAttribute: TTL_TABLES[name],
        removalPolicy,
      });
      for (let i = 1; i <= GSI_COUNT[name]; i += 1) {
        table.addGlobalSecondaryIndex({
          indexName: `gsi${i}`,
          partitionKey: { name: `gsi${i}pk`, type: dynamodb.AttributeType.STRING },
          sortKey: { name: `gsi${i}sk`, type: dynamodb.AttributeType.STRING },
          projectionType: dynamodb.ProjectionType.ALL,
        });
      }
      this.tables[name] = table;
    }

    // --- Cognito ---
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${config.prefix}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { fullname: { required: false, mutable: true } },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy, // prod RETAIN — 기존 시스템의 DESTROY 결함 수정 (REDESIGN_PLAN §2.2)
    });
    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `${config.prefix}-web`,
      authFlows: { userPassword: true },
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });
    for (const group of ['admins', 'operators', 'creators']) {
      new cognito.CfnUserPoolGroup(this, `${pascal(group)}Group`, {
        userPoolId: this.userPool.userPoolId,
        groupName: group,
      });
    }

    // --- S3 (사용자 콘텐츠만 — 정적 사이트 버킷은 빌드 산출물이므로 EdgeStack 소유) ---
    this.uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      // 계정 ID 접미사 — S3 버킷명은 전역 유니크라 계정 바뀌어도 충돌 안 나게
      bucketName: `${config.prefix}-uploads-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy,
      autoDeleteObjects: !config.isProd,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: config.cors.allowOrigins,
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });
    // CloudFront OAC 읽기 허용 — uploads 버킷의 정책은 이 스택이 단독 소유한다.
    // EdgeStack의 CloudFront 배포(계정 내)를 SourceArn 와일드카드로 허용해 배포 ID를
    // 알 필요 없이 순환 참조를 피한다 (imported-bucket OAC 정책 충돌 방지).
    this.uploadsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.uploadsBucket.arnForObjects('*')],
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        conditions: {
          StringLike: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
          },
        },
      }),
    );

    // --- Secrets (셸만 생성 — 값은 `npm run ops:set-secrets`로 1회 주입, 코드에 없음) ---
    const secretDefaults = { removalPolicy };
    this.pgSecret = new secretsmanager.Secret(this, 'PgSecret', {
      secretName: `${config.prefix}/pg`,
      description: 'PG(결제대행) API 키 — Phase 3에서 사용',
      ...secretDefaults,
    });
    this.identitySecret = new secretsmanager.Secret(this, 'IdentitySecret', {
      secretName: `${config.prefix}/identity-verification`,
      description: '본인확인기관 API 키 — Phase 3에서 사용',
      ...secretDefaults,
    });
    this.vapidSecret = new secretsmanager.Secret(this, 'VapidSecret', {
      secretName: `${config.prefix}/vapid`,
      description: 'Web Push VAPID 키쌍 — Phase 4에서 사용',
      ...secretDefaults,
    });
    // 익명 ID 솔트 — 값은 `npm run ops:set-anon-salt`로 1회 주입. 회전 금지(과거 활동명 전부 변경됨).
    this.anonSaltSecret = new secretsmanager.Secret(this, 'AnonSaltSecret', {
      secretName: `${config.prefix}/anon-id-salt`,
      description: '익명 활동명 생성 솔트 (social-api) — 고정, 회전 금지',
      ...secretDefaults,
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'UploadsBucketName', { value: this.uploadsBucket.bucketName });
  }
}

function pascal(input: string): string {
  return input.replace(/(^|[-_])(\w)/g, (_, __, ch: string) => ch.toUpperCase());
}
