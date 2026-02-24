#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';

import { ApiStack } from '../stacks/api-stack';
import { CoreStack } from '../stacks/core-stack';
import { AuthStack } from '../stacks/auth-stack';
import { ChallengeStack } from '../stacks/challenge-stack';
import { VerificationStack } from '../stacks/verification-stack';
import { CheerStack } from '../stacks/cheer-stack';
import { AdminStack } from '../stacks/admin-stack';
import { QuestStack } from '../stacks/quest-stack';
import { BulletinStack } from '../stacks/bulletin-stack';
import { FrontendStack } from '../stacks/frontend-stack';

import { devConfig } from '../config/dev';
import { prodConfig } from '../config/prod';

const app = new App();

const stage = app.node.tryGetContext('stage') || 'dev';
const config = stage === 'prod' ? prodConfig : devConfig;
const env = {
  account: config.account,
  region: config.region,
};

const apiStack = new ApiStack(app, `chme-${stage}-api`, {
  env,
  stage,
});

const coreStack = new CoreStack(app, `chme-${stage}-core`, {
  env,
  stage,
  config,
});

new AuthStack(app, `chme-${stage}-auth`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  userPool: coreStack.userPool,
  userPoolClient: coreStack.userPoolClient,
  usersTable: coreStack.usersTable,
});

new ChallengeStack(app, `chme-${stage}-challenge`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});

new VerificationStack(app, `chme-${stage}-verification`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  verificationsTable: coreStack.verificationsTable,
  userChallengesTable: coreStack.userChallengesTable,
  uploadsBucket: coreStack.uploadsBucket,
});

new CheerStack(app, `chme-${stage}-cheer`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  cheersTable: coreStack.cheersTable,
  userCheerTicketsTable: coreStack.userCheerTicketsTable,
  userChallengesTable: coreStack.userChallengesTable,
  snsTopic: coreStack.snsTopic,
  eventBus: coreStack.eventBus,
});

new AdminStack(app, `chme-${stage}-admin`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  usersTable: coreStack.usersTable,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});

new QuestStack(app, `chme-${stage}-quest`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  questsTable: coreStack.questsTable,
  questSubmissionsTable: coreStack.questSubmissionsTable,
  activeQuestSubmissionsTable: coreStack.activeQuestSubmissionsTable,
  challengesTable: coreStack.challengesTable,
});

new BulletinStack(app, `chme-${stage}-bulletin`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  bulletinPostsTable: coreStack.bulletinPostsTable,
  bulletinCommentsTable: coreStack.bulletinCommentsTable,
  bulletinLikesTable: coreStack.bulletinLikesTable,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});

new FrontendStack(app, `chme-${stage}-frontend`, {
  env,
  stage,
  config,
});

app.synth();
