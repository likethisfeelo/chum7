#!/usr/bin/env node
// infra/bin/chme.ts
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { CoreStack } from '../stacks/core-stack';
import { AuthStack } from '../stacks/auth-stack';
import { ChallengeStack } from '../stacks/challenge-stack';
import { VerificationStack } from '../stacks/verification-stack';
import { CheerStack } from '../stacks/cheer-stack';
import { AdminStack } from '../stacks/admin-stack';
import { devConfig } from '../config/dev';
import { prodConfig } from '../config/prod';

const app = new App();

// Context에서 stage 가져오기 (기본값: dev)
const stage = app.node.tryGetContext('stage') || 'dev';
const config = stage === 'prod' ? prodConfig : devConfig;

console.log(`🚀 Deploying ${stage.toUpperCase()} environment...`);

// ==================== Core Stack ====================
const coreStack = new CoreStack(app, `chme-${stage}-core`, {
  env: { 
    account: config.account, 
    region: config.region 
  },
  stage,
  config,
  stackName: `chme-${stage}-core`,
  description: `CHME ${stage} - Core Infrastructure (API Gateway, Cognito, DynamoDB Tables)`,
});

// ==================== Auth Stack ====================
const authStack = new AuthStack(app, `chme-${stage}-auth`, {
  env: { 
    account: config.account, 
    region: config.region 
  },
  stage,
  apiGateway: coreStack.apiGateway,
  userPool: coreStack.userPool,
  usersTable: coreStack.usersTable,
  stackName: `chme-${stage}-auth`,
  description: `CHME ${stage} - Auth (Register, Login, Profile)`,
});

// ==================== Challenge Stack ====================
const challengeStack = new ChallengeStack(app, `chme-${stage}-challenge`, {
  env: { 
    account: config.account, 
    region: config.region 
  },
  stage,
  apiGateway: coreStack.apiGateway,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
  stackName: `chme-${stage}-challenge`,
  description: `CHME ${stage} - Challenge (List, Detail, Join, My Challenges)`,
});

// ==================== Verification Stack ====================
const verificationStack = new VerificationStack(app, `chme-${stage}-verification`, {
  env: { 
    account: config.account, 
    region: config.region 
  },
  stage,
  apiGateway: coreStack.apiGateway,
  verificationsTable: coreStack.verificationsTable,
  userChallengesTable: coreStack.userChallengesTable,
  uploadsBucket: coreStack.uploadsBucket,
  stackName: `chme-${stage}-verification`,
  description: `CHME ${stage} - Verification (Submit, Remedy, Upload)`,
});

// ==================== Cheer Stack ====================
const cheerStack = new CheerStack(app, `chme-${stage}-cheer`, {
  env: { 
    account: config.account, 
    region: config.region 
  },
  stage,
  apiGateway: coreStack.apiGateway,
  cheersTable: coreStack.cheersTable,
  userCheerTicketsTable: coreStack.userCheerTicketsTable,
  snsTopic: coreStack.snsTopic,
  eventBus: coreStack.eventBus,
  stackName: `chme-${stage}-cheer`,
  description: `CHME ${stage} - Cheer (Immediate, Scheduled, Tickets)`,
});

// ==================== Admin Stack ====================
const adminStack = new AdminStack(app, `chme-${stage}-admin`, {
  env: { 
    account: config.account, 
    region: config.region 
  },
  stage,
  apiGateway: coreStack.apiGateway,
  userPool: coreStack.userPool,
  usersTable: coreStack.usersTable,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
  stackName: `chme-${stage}-admin`,
  description: `CHME ${stage} - Admin (Challenge CRUD, User Management, Stats)`,
});

// ==================== Stack Dependencies ====================
authStack.addDependency(coreStack);
challengeStack.addDependency(coreStack);
verificationStack.addDependency(coreStack);
cheerStack.addDependency(coreStack);
adminStack.addDependency(coreStack);

// ==================== Tags ====================
[coreStack, authStack, challengeStack, verificationStack, cheerStack, adminStack].forEach(stack => {
  stack.tags.setTag('Project', 'CHME');
  stack.tags.setTag('Environment', stage);
  stack.tags.setTag('ManagedBy', 'CDK');
});

app.synth();
