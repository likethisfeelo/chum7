// infra/bin/chme.ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CoreStack } from '../stacks/core-stack';
import { DynamoDBStack } from '../stacks/dynamodb-stack';
import { AuthStack } from '../stacks/auth-stack';
import { ChallengeStack } from '../stacks/challenge-stack';
import { VerificationStack } from '../stacks/verification-stack';
import { CheerStack } from '../stacks/cheer-stack';
import { getConfig } from '../config';

const app = new cdk.App();

// Stage 설정 (dev 또는 prod)
const stage = app.node.tryGetContext('stage') || 'dev';
const config = getConfig(stage as 'dev' | 'prod');

console.log(`🚀 Deploying CHME ${stage.toUpperCase()} stacks...`);
console.log(`📍 Region: ${config.region}`);
console.log(`🏷️  Account: ${config.account}`);

const env = {
  account: config.account,
  region: config.region
};

// ==========================================
// Layer 1: Core Infrastructure
// ==========================================
const coreStack = new CoreStack(app, `chme-${stage}-core`, {
  env,
  config,
  description: `CHME ${stage} - Core Infrastructure (API Gateway, Cognito, S3, SNS, EventBridge)`
});

// ==========================================
// Layer 2: Database
// ==========================================
const dynamoStack = new DynamoDBStack(app, `chme-${stage}-dynamodb`, {
  env,
  config,
  description: `CHME ${stage} - DynamoDB Tables (6 tables with GSIs)`
});

// DynamoDB는 Core에 독립적
// (하지만 순서상 Core가 먼저 배포되도록)
dynamoStack.addDependency(coreStack);

// ==========================================
// Layer 3: Feature Stacks
// ==========================================

// Auth Stack
const authStack = new AuthStack(app, `chme-${stage}-auth`, {
  env,
  config,
  apiGateway: coreStack.apiGateway,
  userPool: coreStack.userPool,
  userPoolClient: coreStack.userPoolClient,
  usersTable: dynamoStack.usersTable,
  description: `CHME ${stage} - Authentication (Register, Login, Profile)`
});
authStack.addDependency(coreStack);
authStack.addDependency(dynamoStack);

// Challenge Stack
const challengeStack = new ChallengeStack(app, `chme-${stage}-challenge`, {
  env,
  config,
  apiGateway: coreStack.apiGateway,
  challengesTable: dynamoStack.challengesTable,
  userChallengesTable: dynamoStack.userChallengesTable,
  description: `CHME ${stage} - Challenge System (List, Join, My Challenges)`
});
challengeStack.addDependency(coreStack);
challengeStack.addDependency(dynamoStack);

// Verification Stack
const verificationStack = new VerificationStack(app, `chme-${stage}-verification`, {
  env,
  config,
  apiGateway: coreStack.apiGateway,
  userChallengesTable: dynamoStack.userChallengesTable,
  verificationsTable: dynamoStack.verificationsTable,
  userCheerTicketsTable: dynamoStack.userCheerTicketsTable,
  uploadsBucket: coreStack.uploadsBucket,
  description: `CHME ${stage} - Verification System (Submit, Remedy, Smart Cheer Detection)`
});
verificationStack.addDependency(coreStack);
verificationStack.addDependency(dynamoStack);

// Cheer Stack
const cheerStack = new CheerStack(app, `chme-${stage}-cheer`, {
  env,
  config,
  apiGateway: coreStack.apiGateway,
  cheersTable: dynamoStack.cheersTable,
  userCheerTicketsTable: dynamoStack.userCheerTicketsTable,
  userChallengesTable: dynamoStack.userChallengesTable,
  snsTopic: coreStack.snsTopic,
  eventBus: coreStack.eventBus,
  description: `CHME ${stage} - Smart Cheer System (Immediate, Scheduled, Tickets)`
});
cheerStack.addDependency(coreStack);
cheerStack.addDependency(dynamoStack);

// ==========================================
// Stack Tags
// ==========================================
const tags = {
  Project: 'CHME',
  Environment: stage,
  ManagedBy: 'CDK',
  Version: '1.0.0'
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

app.synth();

console.log(`✅ ${stage.toUpperCase()} stacks synthesized successfully!`);
