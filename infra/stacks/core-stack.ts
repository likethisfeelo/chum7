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
          : ['http://localhost:5173', 'http://localhost:5174'],
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
    this.usersTable = new Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.challengesTable = new Table(this, 'ChallengesTable', {
      partitionKey: { name: 'challengeId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.userChallengesTable = new Table(this, 'UserChallengesTable', {
      partitionKey: { name: 'userChallengeId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.verificationsTable = new Table(this, 'VerificationsTable', {
      partitionKey: { name: 'verificationId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.cheersTable = new Table(this, 'CheersTable', {
      partitionKey: { name: 'cheerId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.userCheerTicketsTable = new Table(this, 'UserCheerTicketsTable', {
      partitionKey: { name: 'ticketId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    // ==================== External Resources ====================
    this.uploadsBucket = Bucket.fromBucketName(this, 'Uploads', config.s3.uploadsBucket);
    this.snsTopic = new Topic(this, 'Topic');
    this.eventBus = new EventBus(this, 'Bus');

    // ==================== Outputs ====================
    new CfnOutput(this, 'ApiUrl', { value: this.apiGateway.apiEndpoint });
  }
}