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
import { ChallengeBoardStack } from '../stacks/challenge-board-stack';
import { FrontendStack } from '../stacks/frontend-stack';
import { BadgeStack } from '../stacks/badge-stack';

import { devConfig } from '../config/dev';
import { prodConfig } from '../config/prod';

const app = new App();

const stage = app.node.tryGetContext('stage') || 'dev';
const config = stage === 'prod' ? prodConfig : devConfig;
const env = {
  account: config.account,
  region: config.region,
};

const plazaConvertFailureAlertEmail = app.node.tryGetContext('plazaConvertFailureAlertEmail');

// CoreStack을 먼저 생성 (ApiStack에 Cognito 정보 전달 필요)
const coreStack = new CoreStack(app, `chme-${stage}-core`, {
  env,
  stage,
  config,
});

const apiStack = new ApiStack(app, `chme-${stage}-api`, {
  env,
  stage,
  userPoolId: coreStack.userPool.userPoolId,
  userPoolClientId: coreStack.userPoolClient.userPoolClientId,
});

new AuthStack(app, `chme-${stage}-auth`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  authorizer: apiStack.cognitoAuthorizer,
  userPool: coreStack.userPool,
  userPoolClient: coreStack.userPoolClient,
  usersTable: coreStack.usersTable,
  userCheerTicketsTable: coreStack.userCheerTicketsTable,
});

new ChallengeStack(app, `chme-${stage}-challenge`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  authorizer: apiStack.cognitoAuthorizer,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
  personalQuestProposalsTable: coreStack.personalQuestProposalsTable,
  notificationsTable: coreStack.notificationsTable,
  payoutAuditLogsTable: coreStack.payoutAuditLogsTable,
  categoryBannersTable: coreStack.categoryBannersTable,
});

new VerificationStack(app, `chme-${stage}-verification`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  authorizer: apiStack.cognitoAuthorizer,
  verificationsTable: coreStack.verificationsTable,
  userChallengesTable: coreStack.userChallengesTable,
  uploadsBucket: coreStack.uploadsBucket,
  challengesTable: coreStack.challengesTable,
  userCheerTicketsTable: coreStack.userCheerTicketsTable,
  badgesTable: coreStack.badgesTable,
  plazaPostsTable: coreStack.plazaPostsTable,
  plazaCommentsTable: coreStack.plazaCommentsTable,
  plazaReactionsTable: coreStack.plazaReactionsTable,
  plazaRecommendationsTable: coreStack.plazaRecommendationsTable,
  plazaConvertFailureAlertEmail,
});

new CheerStack(app, `chme-${stage}-cheer`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  authorizer: apiStack.cognitoAuthorizer,
  cheersTable: coreStack.cheersTable,
  cheerDeadLettersTable: coreStack.cheerDeadLettersTable,
  userCheerTicketsTable: coreStack.userCheerTicketsTable,
  userChallengesTable: coreStack.userChallengesTable,
  usersTable: coreStack.usersTable,
  challengesTable: coreStack.challengesTable,
  snsTopic: coreStack.snsTopic,
  eventBus: coreStack.eventBus,
});

new BadgeStack(app, `chme-${stage}-badge`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  authorizer: apiStack.cognitoAuthorizer,
  badgesTable: coreStack.badgesTable,
});

new AdminStack(app, `chme-${stage}-admin`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  authorizer: apiStack.cognitoAuthorizer,
  usersTable: coreStack.usersTable,
  cheersTable: coreStack.cheersTable,
  cheerDeadLettersTable: coreStack.cheerDeadLettersTable,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
  questSubmissionsTable: coreStack.questSubmissionsTable,
  verificationsTable: coreStack.verificationsTable,
  personalQuestProposalsTable: coreStack.personalQuestProposalsTable,
  notificationsTable: coreStack.notificationsTable,
  categoryBannersTable: coreStack.categoryBannersTable,
});

new QuestStack(app, `chme-${stage}-quest`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  authorizer: apiStack.cognitoAuthorizer,
  questsTable: coreStack.questsTable,
  questSubmissionsTable: coreStack.questSubmissionsTable,
  activeQuestSubmissionsTable: coreStack.activeQuestSubmissionsTable,
  challengesTable: coreStack.challengesTable,
  uploadsBucket: coreStack.uploadsBucket,
});

new BulletinStack(app, `chme-${stage}-bulletin`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  authorizer: apiStack.cognitoAuthorizer,
  bulletinPostsTable: coreStack.bulletinPostsTable,
  bulletinCommentsTable: coreStack.bulletinCommentsTable,
  bulletinLikesTable: coreStack.bulletinLikesTable,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
});


new ChallengeBoardStack(app, `chme-${stage}-challenge-board`, {
  env,
  stage,
  apiGateway: apiStack.apiGateway,
  authorizer: apiStack.cognitoAuthorizer,
  challengesTable: coreStack.challengesTable,
  userChallengesTable: coreStack.userChallengesTable,
  challengeBoardsTable: coreStack.challengeBoardsTable,
  challengeCommentsTable: coreStack.challengeCommentsTable,
  challengePreviewsTable: coreStack.challengePreviewsTable,
  notificationsTable: coreStack.notificationsTable,
});

new FrontendStack(app, `chme-${stage}-frontend`, {
  env,
  stage,
  config,
});

app.synth();
