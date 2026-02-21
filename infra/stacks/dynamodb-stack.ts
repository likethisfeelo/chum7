// infra/stacks/dynamodb-stack.ts
import {
  Stack,
  StackProps,
  RemovalPolicy,
  CfnOutput
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { InfraConfig } from '../config';

export interface DynamoDBStackProps extends StackProps {
  config: InfraConfig;
}

export class DynamoDBStack extends Stack {
  public readonly usersTable: dynamodb.Table;
  public readonly challengesTable: dynamodb.Table;
  public readonly userChallengesTable: dynamodb.Table;
  public readonly verificationsTable: dynamodb.Table;
  public readonly cheersTable: dynamodb.Table;
  public readonly userCheerTicketsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDBStackProps) {
    super(scope, id, props);

    const { config } = props;
    const { stage } = config;

    // ==========================================
    // 1. Users 테이블
    // ==========================================
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `chme-${stage}-users`,
      partitionKey: { 
        name: 'userId', 
        type: dynamodb.AttributeType.STRING 
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod'
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    });

    // GSI: email로 사용자 조회
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { 
        name: 'email', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // ==========================================
    // 2. Challenges 테이블
    // ==========================================
    this.challengesTable = new dynamodb.Table(this, 'ChallengesTable', {
      tableName: `chme-${stage}-challenges`,
      partitionKey: { 
        name: 'challengeId', 
        type: dynamodb.AttributeType.STRING 
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod'
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY
    });

    // GSI: category별 챌린지 조회
    this.challengesTable.addGlobalSecondaryIndex({
      indexName: 'category-index',
      partitionKey: { 
        name: 'category', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // ==========================================
    // 3. UserChallenges 테이블
    // ==========================================
    this.userChallengesTable = new dynamodb.Table(this, 'UserChallengesTable', {
      tableName: `chme-${stage}-user-challenges`,
      partitionKey: { 
        name: 'userChallengeId', 
        type: dynamodb.AttributeType.STRING 
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod'
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    });

    // GSI: userId로 사용자의 챌린지 조회
    this.userChallengesTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { 
        name: 'userId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'startDate',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // GSI: groupId로 같은 그룹 멤버 조회 (스마트 응원용)
    this.userChallengesTable.addGlobalSecondaryIndex({
      indexName: 'groupId-index',
      partitionKey: { 
        name: 'groupId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // GSI: challengeId로 특정 챌린지 참가자 조회
    this.userChallengesTable.addGlobalSecondaryIndex({
      indexName: 'challengeId-index',
      partitionKey: { 
        name: 'challengeId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'startDate',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // ==========================================
    // 4. Verifications 테이블
    // ==========================================
    this.verificationsTable = new dynamodb.Table(this, 'VerificationsTable', {
      tableName: `chme-${stage}-verifications`,
      partitionKey: { 
        name: 'verificationId', 
        type: dynamodb.AttributeType.STRING 
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod'
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    });

    // GSI: userChallengeId로 특정 챌린지의 인증 조회
    this.verificationsTable.addGlobalSecondaryIndex({
      indexName: 'userChallengeId-index',
      partitionKey: { 
        name: 'userChallengeId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'day',
        type: dynamodb.AttributeType.NUMBER
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // GSI: userId로 사용자의 모든 인증 조회
    this.verificationsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: { 
        name: 'userId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // GSI: 공개 인증 피드용
    this.verificationsTable.addGlobalSecondaryIndex({
      indexName: 'public-feed-index',
      partitionKey: { 
        name: 'isPublic', 
        type: dynamodb.AttributeType.STRING // 'true' or 'false'
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // ==========================================
    // 5. Cheers 테이블 (스마트 응원)
    // ==========================================
    this.cheersTable = new dynamodb.Table(this, 'CheersTable', {
      tableName: `chme-${stage}-cheers`,
      partitionKey: { 
        name: 'cheerId', 
        type: dynamodb.AttributeType.STRING 
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod'
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    });

    // GSI: senderId로 보낸 응원 조회
    this.cheersTable.addGlobalSecondaryIndex({
      indexName: 'senderId-index',
      partitionKey: { 
        name: 'senderId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // GSI: receiverId로 받은 응원 조회
    this.cheersTable.addGlobalSecondaryIndex({
      indexName: 'receiverId-index',
      partitionKey: { 
        name: 'receiverId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // GSI: 예약 응원 조회 (scheduledTime으로)
    this.cheersTable.addGlobalSecondaryIndex({
      indexName: 'scheduled-index',
      partitionKey: { 
        name: 'status', 
        type: dynamodb.AttributeType.STRING // 'pending', 'sent', 'failed'
      },
      sortKey: {
        name: 'scheduledTime',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // ==========================================
    // 6. UserCheerTickets 테이블 (응원권)
    // ==========================================
    this.userCheerTicketsTable = new dynamodb.Table(this, 'UserCheerTicketsTable', {
      tableName: `chme-${stage}-user-cheer-tickets`,
      partitionKey: { 
        name: 'ticketId', 
        type: dynamodb.AttributeType.STRING 
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: stage === 'prod',
      removalPolicy: stage === 'prod'
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAtTimestamp' // 자동 삭제
    });

    // GSI: userId로 사용자의 응원권 조회
    this.userCheerTicketsTable.addGlobalSecondaryIndex({
      indexName: 'userId-status-index',
      partitionKey: { 
        name: 'userId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING // 'available', 'used', 'expired'
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // GSI: 만료 예정 응원권 조회
    this.userCheerTicketsTable.addGlobalSecondaryIndex({
      indexName: 'status-expires-index',
      partitionKey: { 
        name: 'status', 
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'expiresAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL
    });

    // ==========================================
    // Outputs
    // ==========================================
    new CfnOutput(this, 'UsersTableName', {
      value: this.usersTable.tableName,
      exportName: `chme-${stage}-users-table-name`
    });

    new CfnOutput(this, 'ChallengesTableName', {
      value: this.challengesTable.tableName,
      exportName: `chme-${stage}-challenges-table-name`
    });

    new CfnOutput(this, 'UserChallengesTableName', {
      value: this.userChallengesTable.tableName,
      exportName: `chme-${stage}-user-challenges-table-name`
    });

    new CfnOutput(this, 'VerificationsTableName', {
      value: this.verificationsTable.tableName,
      exportName: `chme-${stage}-verifications-table-name`
    });

    new CfnOutput(this, 'CheersTableName', {
      value: this.cheersTable.tableName,
      exportName: `chme-${stage}-cheers-table-name`
    });

    new CfnOutput(this, 'UserCheerTicketsTableName', {
      value: this.userCheerTicketsTable.tableName,
      exportName: `chme-${stage}-user-cheer-tickets-table-name`
    });
  }
}