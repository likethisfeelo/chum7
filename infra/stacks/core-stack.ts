import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  HttpApi,
  CorsHttpMethod,
  CorsPreflightOptions,
} from 'aws-cdk-lib/aws-apigatewayv2';

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
  public readonly apiGateway: HttpApi;
  public readonly apiGatewayId: string;

  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly adminsGroup: CfnUserPoolGroup;

  public readonly usersTable: Table;
  public readonly challengesTable: Table;
  public readonly userChallengesTable: Table;
  public readonly verificationsTable: Table;
  public readonly cheersTable: Table;
  public readonly userCheerTicketsTable: Table;

  public readonly uploadsBucket: IBucket;
  public readonly snsTopic: Topic;
  public readonly eventBus: EventBus;

  constructor(scope: Construct, id: string, props: CoreStackProps) {
    super(scope, id, props);

    const { stage, config } = props;

    // ==================== API Gateway ====================
    const corsConfig: CorsPreflightOptions = {
      allowOrigins:
        stage === 'prod'
          ? ['https://www.chum7.com']
          : [
              'http://localhost:5173',
              'http://localhost:5174',
              'https://test.chum7.com',
              'https://admin-dev.chum7.com',
            ],
      allowMethods: [
        CorsHttpMethod.GET,
        CorsHttpMethod.POST,
        CorsHttpMethod.PUT,
        CorsHttpMethod.DELETE,
        CorsHttpMethod.OPTIONS,
      ],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: Duration.days(1),
    };

    this.apiGateway = new HttpApi(this, 'ApiGateway', {
      apiName: `chme-${stage}-api`,
      corsPreflight: corsConfig,
    });

    this.apiGatewayId = this.apiGateway.httpApiId;

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
      pointInTimeRecovery: isProd,
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
      pointInTimeRecovery: isProd,
      removalPolicy,
    });
    this.challengesTable.addGlobalSecondaryIndex({
      indexName: 'category-index',
      partitionKey: { name: 'category', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.userChallengesTable = new Table(this, 'UserChallengesTable', {
      tableName: `chme-${stage}-user-challenges`,
      partitionKey: { name: 'userChallengeId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: isProd,
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
      pointInTimeRecovery: isProd,
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
      pointInTimeRecovery: isProd,
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
      pointInTimeRecovery: isProd,
      removalPolicy,
      timeToLiveAttribute: 'expiresAtTimestamp',
    });
    this.userCheerTicketsTable.addGlobalSecondaryIndex({
      indexName: 'userId-status-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'status', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // ==================== External Resources ====================
    this.uploadsBucket = Bucket.fromBucketName(this, 'Uploads', config.s3.uploadsBucket);
    this.snsTopic = new Topic(this, 'Topic');
    this.eventBus = new EventBus(this, 'Bus');

    // ==================== Outputs ====================
    new CfnOutput(this, 'ApiUrl', { value: this.apiGateway.apiEndpoint });
  }
}