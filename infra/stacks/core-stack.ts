import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import {
  UserPool,
  UserPoolClient,
  CfnUserPoolGroup,
  AccountRecovery,
  Mfa,
} from 'aws-cdk-lib/aws-cognito';

import {
  Table,
  AttributeType,
  BillingMode,
  StreamViewType,
  ProjectionType,
} from 'aws-cdk-lib/aws-dynamodb';

import { Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EventBus } from 'aws-cdk-lib/aws-events';

export interface CoreStackProps extends StackProps {
  stage: string;
  config: any;
}

export class CoreStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly adminsGroup: CfnUserPoolGroup;

  public readonly usersTable: Table;
  public readonly challengesTable: Table;
  public readonly userChallengesTable: Table;
  public readonly verificationsTable: Table;
  public readonly cheersTable: Table;
  public readonly userCheerTicketsTable: Table;

  // Quest board tables
  public readonly questsTable: Table;
  public readonly questSubmissionsTable: Table;         // 전체 이력 (append-only)
  public readonly activeQuestSubmissionsTable: Table;  // 현재 상태 + 유니크 보장

  // Bulletin board tables
  public readonly bulletinPostsTable: Table;
  public readonly bulletinCommentsTable: Table;
  public readonly bulletinLikesTable: Table;

  public readonly uploadsBucket: IBucket;
  public readonly snsTopic: Topic;
  public readonly eventBus: EventBus;

  constructor(scope: Construct, id: string, props: CoreStackProps) {
    super(scope, id, props);

    const { stage, config } = props;

    // ==================== Cognito ====================
    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: `chum7-${stage}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      mfa: Mfa.OPTIONAL,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient('UserPoolClient', {
      userPoolClientName: `chum7-${stage}-client`,
      authFlows: { userPassword: true },
    });

    this.adminsGroup = new CfnUserPoolGroup(this, 'AdminsGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admins',
    });

    // ==================== DynamoDB ====================
    const isProd = stage === 'prod';
    const removalPolicy = isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    this.usersTable = new Table(this, 'UsersTable', {
      tableName: `chme-${stage}-users`,
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
    });
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.challengesTable = new Table(this, 'ChallengesTable', {
      tableName: `chme-${stage}-challenges`,
      partitionKey: { name: 'challengeId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    // [MIGRATION STAGE 1] 기존 category-index를 일시적으로 유지 (Stage 2에서 삭제 예정)
    // DynamoDB는 UpdateTable 당 GSI 1개만 허용하므로 단계적 마이그레이션 필요
    this.challengesTable.addGlobalSecondaryIndex({
      indexName: 'category-index',
      partitionKey: { name: 'category', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    // GSI: 카테고리별 챌린지 목록 (challengeStartAt 기준 정렬) - Lambda list/index.ts 사용
    this.challengesTable.addGlobalSecondaryIndex({
      indexName: 'category-index-v2',
      partitionKey: { name: 'category', type: AttributeType.STRING },
      sortKey: { name: 'challengeStartAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    // NOTE: lifecycle-index는 Stage 2에서 추가 예정
    // (category-index 삭제 후 별도 deploy로 추가)

    this.userChallengesTable = new Table(this, 'UserChallengesTable', {
      tableName: `chme-${stage}-user-challenges`,
      partitionKey: { name: 'userChallengeId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
    });
    this.userChallengesTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'startDate', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.userChallengesTable.addGlobalSecondaryIndex({
      indexName: 'challengeId-index',
      partitionKey: { name: 'challengeId', type: AttributeType.STRING },
      sortKey: { name: 'startDate', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.userChallengesTable.addGlobalSecondaryIndex({
      indexName: 'groupId-index',
      partitionKey: { name: 'groupId', type: AttributeType.STRING },
      sortKey: { name: 'userId', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.verificationsTable = new Table(this, 'VerificationsTable', {
      tableName: `chme-${stage}-verifications`,
      partitionKey: { name: 'verificationId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
    });
    this.verificationsTable.addGlobalSecondaryIndex({
      indexName: 'userChallengeId-index',
      partitionKey: { name: 'userChallengeId', type: AttributeType.STRING },
      sortKey: { name: 'day', type: AttributeType.NUMBER },
      projectionType: ProjectionType.ALL,
    });
    this.verificationsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.cheersTable = new Table(this, 'CheersTable', {
      tableName: `chme-${stage}-cheers`,
      partitionKey: { name: 'cheerId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    this.cheersTable.addGlobalSecondaryIndex({
      indexName: 'receiverId-index',
      partitionKey: { name: 'receiverId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.cheersTable.addGlobalSecondaryIndex({
      indexName: 'senderId-index',
      partitionKey: { name: 'senderId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.cheersTable.addGlobalSecondaryIndex({
      indexName: 'scheduled-index',
      partitionKey: { name: 'status', type: AttributeType.STRING },
      sortKey: { name: 'scheduledTime', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.userCheerTicketsTable = new Table(this, 'UserCheerTicketsTable', {
      tableName: `chme-${stage}-user-cheer-tickets`,
      partitionKey: { name: 'ticketId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
      timeToLiveAttribute: 'expiresAtTimestamp',
    });
    this.userCheerTicketsTable.addGlobalSecondaryIndex({
      indexName: 'userId-status-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'status', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // ==================== Quest Board Tables ====================
    this.questsTable = new Table(this, 'QuestsTable', {
      tableName: `chme-${stage}-quests`,
      partitionKey: { name: 'questId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    // GSI: 챌린지별 퀘스트 목록
    this.questsTable.addGlobalSecondaryIndex({
      indexName: 'challengeId-index',
      partitionKey: { name: 'challengeId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    // GSI: 상태별 퀘스트 (active/inactive)
    this.questsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // ------------------------------------------------------------------
    // questSubmissions: 전체 제출 이력 (append-only, 절대 삭제하지 않음)
    // ------------------------------------------------------------------
    this.questSubmissionsTable = new Table(this, 'QuestSubmissionsTable', {
      tableName: `chme-${stage}-quest-submissions`,
      partitionKey: { name: 'submissionId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
    });
    // GSI 1: 유저별 전체 제출 이력 (최신순)
    this.questSubmissionsTable.addGlobalSecondaryIndex({
      indexName: 'userId-createdAt-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    // GSI 2: 퀘스트별 전체 이력 (관리자: 모든 시도 포함 조회)
    this.questSubmissionsTable.addGlobalSecondaryIndex({
      indexName: 'questId-createdAt-index',
      partitionKey: { name: 'questId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    // GSI 3: 관리자 pending 큐 (status별 시간순 처리)
    this.questSubmissionsTable.addGlobalSecondaryIndex({
      indexName: 'status-createdAt-index',
      partitionKey: { name: 'status', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // ------------------------------------------------------------------
    // activeQuestSubmissions: 현재 유효한 제출 상태 (유니크 보장용)
    //   PK: activeSubmissionId = `${userId}#${questId}`
    //   - rejected → DELETE (재제출 허용)
    //   - approved / auto_approved → 유지 (재제출 차단)
    //   - ConditionalWrite로 중복 제출 원자적 방지
    // ------------------------------------------------------------------
    this.activeQuestSubmissionsTable = new Table(this, 'ActiveQuestSubmissionsTable', {
      tableName: `chme-${stage}-active-quest-submissions`,
      partitionKey: { name: 'activeSubmissionId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    // GSI: 퀘스트별 현재 pending/approved 현황 (관리자 대시보드용)
    this.activeQuestSubmissionsTable.addGlobalSecondaryIndex({
      indexName: 'questId-index',
      partitionKey: { name: 'questId', type: AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // ==================== Bulletin Board Tables ====================
    this.bulletinPostsTable = new Table(this, 'BulletinPostsTable', {
      tableName: `chme-${stage}-bulletin-posts`,
      partitionKey: { name: 'postId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    // GSI: challengePhaseKey = `${challengeId}#${phase}` 로 게시판 피드 조회
    this.bulletinPostsTable.addGlobalSecondaryIndex({
      indexName: 'challengePhaseKey-index',
      partitionKey: { name: 'challengePhaseKey', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    // GSI: 유저별 포스트 조회
    this.bulletinPostsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.bulletinCommentsTable = new Table(this, 'BulletinCommentsTable', {
      tableName: `chme-${stage}-bulletin-comments`,
      partitionKey: { name: 'commentId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    // GSI: 포스트별 댓글 목록
    this.bulletinCommentsTable.addGlobalSecondaryIndex({
      indexName: 'postId-index',
      partitionKey: { name: 'postId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // likeId = `${postId}#${userId}` → 유니크 보장 + 중복 방지
    this.bulletinLikesTable = new Table(this, 'BulletinLikesTable', {
      tableName: `chme-${stage}-bulletin-likes`,
      partitionKey: { name: 'likeId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    // GSI: 포스트별 좋아요 수 집계
    this.bulletinLikesTable.addGlobalSecondaryIndex({
      indexName: 'postId-index',
      partitionKey: { name: 'postId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.KEYS_ONLY,
    });

    // ==================== External Resources ====================
    this.uploadsBucket = Bucket.fromBucketName(this, 'Uploads', config.s3.uploadsBucket);
    this.snsTopic = new Topic(this, 'Topic');
    this.eventBus = new EventBus(this, 'Bus');

  }
}