#!/usr/bin/env node
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

const stage = app.node.tryGetContext('stage') || 'dev';
const config = stage === 'prod' ? prodConfig : devConfig;
const env = {
  account: config.account,
  region: config.region,
};

const coreStack = new CoreStack(app, `chme-${stage}-core`, {
  env,
  stage,
  config,
});

const authStack = new AuthStack(app, `chme-${stage}-auth`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  userPool: coreStack.userPool,
  userPoolClient: coreStack.userPoolClient,
  usersTable: coreStack.usersTable,
});

const challengeStack = new ChallengeStack(app, `chme-${stage}-challenge`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});

const verificationStack = new VerificationStack(app, `chme-${stage}-verification`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  verificationsTable: coreStack.verificationsTable,
  userChallengesTable: coreStack.userChallengesTable,
  uploadsBucket: coreStack.uploadsBucket,
});

const cheerStack = new CheerStack(app, `chme-${stage}-cheer`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  cheersTable: coreStack.cheersTable,
  userCheerTicketsTable: coreStack.userCheerTicketsTable,
  userChallengesTable: coreStack.userChallengesTable,
  snsTopic: coreStack.snsTopic,
  eventBus: coreStack.eventBus,
});

const adminStack = new AdminStack(app, `chme-${stage}-admin`, {
  env,
  stage,
  apiGateway: coreStack.apiGateway,
  usersTable: coreStack.usersTable,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});

authStack.addDependency(coreStack);
challengeStack.addDependency(coreStack);
verificationStack.addDependency(coreStack);
cheerStack.addDependency(coreStack);
adminStack.addDependency(coreStack);

app.synth();