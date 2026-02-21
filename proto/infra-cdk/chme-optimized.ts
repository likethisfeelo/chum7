#!/usr/bin/env node
// infra/bin/chme.ts
import 'source-map-support/register';
import { App, Tags } from 'aws-cdk-lib';
import { CoreStack } from '../stacks/core-stack';
import { AuthStack } from '../stacks/auth-stack';
import { ChallengeStack } from '../stacks/challenge-stack';
import { VerificationStack } from '../stacks/verification-stack';
import { CheerStack } from '../stacks/cheer-stack';
import { AdminStack } from '../stacks/admin-stack';
import { devConfig } from '../config/dev';
import { prodConfig } from '../config/prod';

const app = new App();

// ==================== Stage 설정 ====================
const stage = app.node.tryGetContext('stage') || 'dev';
const config = stage === 'prod' ? prodConfig : devConfig;

// 배포 환경 출력
console.log(`\n${'='.repeat(60)}`);
console.log(`🚀 Deploying CHME ${stage.toUpperCase()} Environment`);
console.log(`${'='.repeat(60)}`);
console.log(`📍 Region:  ${config.region}`);
console.log(`🏷️  Account: ${config.account}`);
console.log(`🌐 Domain:  ${config.domain.app}`);
console.log(`${'='.repeat(60)}\n`);

const env = {
  account: config.account,
  region: config.region,
};

// ==================== Layer 1: Core Infrastructure ====================
console.log('📦 Creating Core Stack...');
const coreStack = new CoreStack(app, `chme-${stage}-core`, {
  env,
  stage,
  config,
  stackName: `chme-${stage}-core`,
  description: `CHME ${stage} - Core Infrastructure (API Gateway, Cognito, DynamoDB Tables, S3, SNS, EventBridge)`,
});

// ==================== Layer 2: Feature Stacks ====================
console.log('📦 Creating Auth Stack...');
const authStack = new AuthStack(app, `chme-${stage}-auth`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  userPool: coreStack.userPool,
  usersTable: coreStack.usersTable,
  stackName: `chme-${stage}-auth`,
  description: `CHME ${stage} - Authentication (Register, Login, Refresh, Profile)`,
});

console.log('📦 Creating Challenge Stack...');
const challengeStack = new ChallengeStack(app, `chme-${stage}-challenge`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
  stackName: `chme-${stage}-challenge`,
  description: `CHME ${stage} - Challenge System (List, Detail, Join, My Challenges, Stats)`,
});

console.log('📦 Creating Verification Stack...');
const verificationStack = new VerificationStack(app, `chme-${stage}-verification`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  verificationsTable: coreStack.verificationsTable,
  userChallengesTable: coreStack.userChallengesTable,
  uploadsBucket: coreStack.uploadsBucket,
  stackName: `chme-${stage}-verification`,
  description: `CHME ${stage} - Verification System (Submit, Get, List, Upload URL, Day 6 Remedy)`,
});

console.log('📦 Creating Cheer Stack...');
const cheerStack = new CheerStack(app, `chme-${stage}-cheer`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  cheersTable: coreStack.cheersTable,
  userCheerTicketsTable: coreStack.userCheerTicketsTable,
  snsTopic: coreStack.snsTopic,
  eventBus: coreStack.eventBus,
  stackName: `chme-${stage}-cheer`,
  description: `CHME ${stage} - Smart Cheer System (Immediate, Scheduled, Tickets, EventBridge)`,
});

console.log('📦 Creating Admin Stack...');
const adminStack = new AdminStack(app, `chme-${stage}-admin`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  userPool: coreStack.userPool,
  usersTable: coreStack.usersTable,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
  stackName: `chme-${stage}-admin`,
  description: `CHME ${stage} - Admin System (Challenge CRUD, User Management, Stats)`,
});

// ==================== Stack Dependencies ====================
authStack.addDependency(coreStack);
challengeStack.addDependency(coreStack);
verificationStack.addDependency(coreStack);
cheerStack.addDependency(coreStack);
adminStack.addDependency(coreStack);

// ==================== Global Tags ====================
const stacks = [
  coreStack,
  authStack,
  challengeStack,
  verificationStack,
  cheerStack,
  adminStack,
];

stacks.forEach((stack) => {
  Tags.of(stack).add('Project', 'CHME');
  Tags.of(stack).add('Environment', stage);
  Tags.of(stack).add('ManagedBy', 'AWS CDK');
  Tags.of(stack).add('Version', '1.0.0');
  Tags.of(stack).add('Repository', 'chum7');
});

// ==================== Synthesize ====================
app.synth();

console.log(`\n${'='.repeat(60)}`);
console.log(`✅ ${stage.toUpperCase()} Stacks Synthesized Successfully!`);
console.log(`${'='.repeat(60)}`);
console.log(`📊 Total Stacks: ${stacks.length}`);
console.log(`   1. Core Stack        (API Gateway, Cognito, DynamoDB, S3, SNS)`);
console.log(`   2. Auth Stack        (5 Lambda functions)`);
console.log(`   3. Challenge Stack   (5 Lambda functions)`);
console.log(`   4. Verification Stack (5 Lambda functions)`);
console.log(`   5. Cheer Stack       (7 Lambda functions + EventBridge)`);
console.log(`   6. Admin Stack       (6 Lambda functions)`);
console.log(`${'='.repeat(60)}`);
console.log(`🚀 Deploy with: cdk deploy --all --context stage=${stage}\n`);
