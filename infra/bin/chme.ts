import 'source-map-support/register';
import { App } from 'aws-cdk-lib';

import { CoreStack } from '../stacks/core-stack';
import { AuthStack } from '../stacks/auth-stack';
import { ChallengeStack } from '../stacks/challenge-stack';
import { VerificationStack } from '../stacks/verification-stack';
import { CheerStack } from '../stacks/cheer-stack';
import { AdminStack } from '../stacks/admin-stack';

import { devConfig } from '../config/dev';

const app = new App();

const stage = 'dev';
const config = devConfig;
const env = {
  account: config.account,
  region: config.region,
};

// ====================
// ⭐ 1️⃣ CoreStack 먼저 생성
// ====================

const coreStack = new CoreStack(app, `chme-${stage}-core`, {
  env,
  stage,
  config,
});

// ====================
// ⭐ 2️⃣ Feature Stacks 생성 (Core 리소스 주입)
// ====================

new AuthStack(app, `chme-${stage}-auth`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  userPool: coreStack.userPool,
  usersTable: coreStack.usersTable,
});

new ChallengeStack(app, `chme-${stage}-challenge`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});

new VerificationStack(app, `chme-${stage}-verification`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  verificationsTable: coreStack.verificationsTable,
  userChallengesTable: coreStack.userChallengesTable,
  uploadsBucket: coreStack.uploadsBucket,
});

new CheerStack(app, `chme-${stage}-cheer`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  cheersTable: coreStack.cheersTable,
  userCheerTicketsTable: coreStack.userCheerTicketsTable,
  snsTopic: coreStack.snsTopic,
  eventBus: coreStack.eventBus,
});

new AdminStack(app, `chme-${stage}-admin`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  usersTable: coreStack.usersTable,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});