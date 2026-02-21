// infra/stacks/core-stack.ts
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
  ProjectionType,
} from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EventBus } from 'aws-cdk-lib/aws-events';

export interface CoreStackProps extends StackProps {
  stage: string;
  config: any;
}

export class CoreStack extends Stack {
  public readonly apiGateway: HttpApi;
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly adminsGroup: CfnUserPoolGroup;
  
  public readonly usersTable: Table;
  public readonly challengesTable: Table;
  public readonly userChallengesTable: Table;
  public readonly verificationsTable: Table;
  public readonly cheersTable: Table;
  public readonly userCheerTicketsTable: Table;
  
  public readonly uploadsBucket: Bucket;
  public readonly snsTopic: Topic;
  public readonly eventBus: EventBus;

  constructor(scope: Construct, id: string, props: CoreStackProps) {
    super(scope, id, props);

    const { stage, config } = props;

    // ==================== API Gateway ====================
    const corsConfig: CorsPreflightOptions = {
      allowOrigins: stage === 'prod' 
        ? ['https://www.chum7.com', 'https://admin.chum7.com']
        : ['https://test.chum7.com', 'http://localhost:5173', 'http://localhost:5174'],
      allowMethods: [
        CorsHttpMethod.GET,
        CorsHttpMethod.POST,
        CorsHttpMethod.PUT,
        CorsHttpMethod.DELETE,
        CorsHttpMethod.OPTIONS,
      ],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date'],
      maxAge: Duration.days(1),
    };

    this.apiGateway = new HttpApi(this, 'ApiGateway', {
      apiName: `chme-${stage}-api`,
      description: `CHME ${stage} HTTP API`,
      corsPreflight: corsConfig,
    });

    // ==================== Cognito User Pool ====================
    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: `chum7-${stage}-users`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      mfa: Mfa.OPTIONAL,
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient('UserPoolClient', {
      userPoolClientName: `chum7-${stage}-client`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        callbackUrls: config.cognito.callbackUrls,
        logoutUrls: config.cognito.logoutUrls,
      },
    });

    // Cognito admins 그룹 생성
    this.adminsGroup = new CfnUserPoolGroup(this, 'AdminsGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admins',
      description: 'Administrators group with full access',
      precedence: 0,
    });

    // ==================== DynamoDB Tables ====================
    
    // 1. Users Table
    this.usersTable = new Table(this, 'UsersTable', {
      tableName: `chme-${stage}-users`,
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // 2. Challenges Table
    this.challengesTable = new Table(this, 'ChallengesTable', {
      tableName: `chme-${stage}-challenges`,
      partitionKey: { name: 'challengeId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    this.challengesTable.addGlobalSecondaryIndex({
      indexName: 'category-index',
      partitionKey: { name: 'category', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // 3. UserChallenges Table
    this.userChallengesTable = new Table(this, 'UserChallengesTable', {
      tableName: `chme-${stage}-user-challenges`,
      partitionKey: { name: 'userChallengeId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
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

    // 4. Verifications Table
    this.verificationsTable = new Table(this, 'VerificationsTable', {
      tableName: `chme-${stage}-verifications`,
      partitionKey: { name: 'verificationId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    this.verificationsTable.addGlobalSecondaryIndex({
      indexName: 'userChallengeId-index',
      partitionKey: { name: 'userChallengeId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // 5. Cheers Table
    this.cheersTable = new Table(this, 'CheersTable', {
      tableName: `chme-${stage}-cheers`,
      partitionKey: { name: 'cheerId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    this.cheersTable.addGlobalSecondaryIndex({
      indexName: 'receiverId-index',
      partitionKey: { name: 'receiverId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.cheersTable.addGlobalSecondaryIndex({
      indexName: 'status-scheduledTime-index',
      partitionKey: { name: 'status', type: AttributeType.STRING },
      sortKey: { name: 'scheduledTime', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // 6. UserCheerTickets Table
    this.userCheerTicketsTable = new Table(this, 'UserCheerTicketsTable', {
      tableName: `chme-${stage}-user-cheer-tickets`,
      partitionKey: { name: 'ticketId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    this.userCheerTicketsTable.addGlobalSecondaryIndex({
      indexName: 'userId-status-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'status', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // ==================== S3 Bucket ====================
    this.uploadsBucket = Bucket.fromBucketName(
      this,
      'UploadsBucket',
      config.s3.uploadsBucket
    );

    // ==================== SNS Topic ====================
    this.snsTopic = new Topic(this, 'NotificationsTopic', {
      topicName: config.sns.topicName,
      displayName: `CHME ${stage} Notifications`,
    });

    // ==================== EventBridge ====================
    this.eventBus = new EventBus(this, 'EventBus', {
      eventBusName: `chme-${stage}-events`,
    });

    // ==================== Outputs ====================
    new CfnOutput(this, 'ApiUrl', {
      value: this.apiGateway.apiEndpoint,
      exportName: `${stage}-api-url`,
    });

    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `${stage}-user-pool-id`,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${stage}-user-pool-client-id`,
    });
  }
}
