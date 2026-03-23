import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';

interface PersonalFeedStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  usersTable: Table;
  userChallengesTable: Table;
  verificationsTable: Table;
  cheersTable: Table;
  badgesTable: Table;
  challengesTable: Table;
  uploadsBucket: IBucket;
  feedFollowsTable: Table;
  feedBlocksTable: Table;
  feedInviteLinksTable: Table;
}

export class PersonalFeedStack extends Stack {
  constructor(scope: Construct, id: string, props: PersonalFeedStackProps) {
    super(scope, id, props);

    const {
      stage,
      apiGateway,
      authorizer,
      usersTable,
      userChallengesTable,
      verificationsTable,
      cheersTable,
      badgesTable,
      challengesTable,
      uploadsBucket,
      feedFollowsTable,
      feedBlocksTable,
      feedInviteLinksTable,
    } = props;

    const commonProps = {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
    };

    const commonEnv = {
      STAGE: stage,
      USERS_TABLE: usersTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      VERIFICATIONS_TABLE: verificationsTable.tableName,
      CHEERS_TABLE: cheersTable.tableName,
      BADGES_TABLE: badgesTable.tableName,
      CHALLENGES_TABLE: challengesTable.tableName,
      UPLOADS_BUCKET: uploadsBucket.bucketName,
      FEED_FOLLOWS_TABLE: feedFollowsTable.tableName,
      FEED_BLOCKS_TABLE: feedBlocksTable.tableName,
      FEED_INVITE_LINKS_TABLE: feedInviteLinksTable.tableName,
    };

    // 1. GET /personal-feed/{userId} — 피드 프로필 + 레이어 판단
    const profileFn = new NodejsFunction(this, 'PersonalFeedProfileFn', {
      ...commonProps,
      functionName: `chme-${stage}-personal-feed-profile`,
      entry: path.join(__dirname, '../../backend/services/personal-feed/profile/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    usersTable.grantReadData(profileFn);
    feedFollowsTable.grantReadData(profileFn);
    feedBlocksTable.grantReadData(profileFn);
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedProfileIntegration', profileFn),
      authorizer,
    });

    // 2. GET /personal-feed/{userId}/achievements — 시스템 업적 조회
    const achievementsFn = new NodejsFunction(this, 'PersonalFeedAchievementsFn', {
      ...commonProps,
      functionName: `chme-${stage}-personal-feed-achievements`,
      entry: path.join(__dirname, '../../backend/services/personal-feed/achievements/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    userChallengesTable.grantReadData(achievementsFn);
    verificationsTable.grantReadData(achievementsFn);
    cheersTable.grantReadData(achievementsFn);
    badgesTable.grantReadData(achievementsFn);
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}/achievements',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedAchievementsIntegration', achievementsFn),
      authorizer,
    });

    // 3. GET /personal-feed/{userId}/verifications — 인증 게시물 목록 (Tab 01)
    const verificationsFn = new NodejsFunction(this, 'PersonalFeedVerificationsFn', {
      ...commonProps,
      functionName: `chme-${stage}-personal-feed-verifications`,
      entry: path.join(__dirname, '../../backend/services/personal-feed/verifications/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    verificationsTable.grantReadData(verificationsFn);
    uploadsBucket.grantRead(verificationsFn);
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}/verifications',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedVerificationsIntegration', verificationsFn),
      authorizer,
    });

    // 4. GET /personal-feed/{userId}/challenges — 챌린지 목록 (Tab 02)
    const challengesFn = new NodejsFunction(this, 'PersonalFeedChallengesFn', {
      ...commonProps,
      functionName: `chme-${stage}-personal-feed-challenges`,
      entry: path.join(__dirname, '../../backend/services/personal-feed/challenges/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    userChallengesTable.grantReadData(challengesFn);
    challengesTable.grantReadData(challengesFn);
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}/challenges',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedChallengesIntegration', challengesFn),
      authorizer,
    });

    // 5. Follow Lambda — 팔로우 시스템 (POST/PUT/DELETE/GET)
    const followFn = new NodejsFunction(this, 'PersonalFeedFollowFn', {
      ...commonProps,
      functionName: `chme-${stage}-personal-feed-follow`,
      entry: path.join(__dirname, '../../backend/services/personal-feed/follow/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    feedFollowsTable.grantReadWriteData(followFn);
    feedBlocksTable.grantReadData(followFn);

    // POST /personal-feed/{userId}/follow-request
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}/follow-request',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PersonalFeedFollowRequestIntegration', followFn),
      authorizer,
    });
    // PUT /personal-feed/follow-requests/{followId}/accept
    apiGateway.addRoutes({
      path: '/personal-feed/follow-requests/{followId}/accept',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('PersonalFeedFollowAcceptIntegration', followFn),
      authorizer,
    });
    // PUT /personal-feed/follow-requests/{followId}/reject
    apiGateway.addRoutes({
      path: '/personal-feed/follow-requests/{followId}/reject',
      methods: [HttpMethod.PUT],
      integration: new HttpLambdaIntegration('PersonalFeedFollowRejectIntegration', followFn),
      authorizer,
    });
    // DELETE /personal-feed/{userId}/follow (팔로워 자발 취소)
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}/follow',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('PersonalFeedUnfollowIntegration', followFn),
      authorizer,
    });
    // DELETE /personal-feed/followers/{followerId} (강제 해제)
    apiGateway.addRoutes({
      path: '/personal-feed/followers/{followerId}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('PersonalFeedRemoveFollowerIntegration', followFn),
      authorizer,
    });
    // GET /personal-feed/me/followers
    apiGateway.addRoutes({
      path: '/personal-feed/me/followers',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedFollowersIntegration', followFn),
      authorizer,
    });
    // GET /personal-feed/me/follow-requests
    apiGateway.addRoutes({
      path: '/personal-feed/me/follow-requests',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedFollowRequestsIntegration', followFn),
      authorizer,
    });

    // 6. Block Lambda — 차단 시스템 (POST/DELETE/GET)
    const blockFn = new NodejsFunction(this, 'PersonalFeedBlockFn', {
      ...commonProps,
      functionName: `chme-${stage}-personal-feed-block`,
      entry: path.join(__dirname, '../../backend/services/personal-feed/block/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    feedBlocksTable.grantReadWriteData(blockFn);

    // POST /personal-feed/{userId}/block
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}/block',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PersonalFeedBlockIntegration', blockFn),
      authorizer,
    });
    // DELETE /personal-feed/{userId}/block
    apiGateway.addRoutes({
      path: '/personal-feed/{userId}/block',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('PersonalFeedUnblockIntegration', blockFn),
      authorizer,
    });
    // GET /personal-feed/me/blocked
    apiGateway.addRoutes({
      path: '/personal-feed/me/blocked',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedBlockedListIntegration', blockFn),
      authorizer,
    });

    // 7. Invite Lambda — 초대 링크 시스템 (POST/GET/DELETE + token resolve)
    const inviteFn = new NodejsFunction(this, 'PersonalFeedInviteFn', {
      ...commonProps,
      functionName: `chme-${stage}-personal-feed-invite`,
      entry: path.join(__dirname, '../../backend/services/personal-feed/invite/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    feedInviteLinksTable.grantReadWriteData(inviteFn);

    // POST /personal-feed/me/invite-links
    apiGateway.addRoutes({
      path: '/personal-feed/me/invite-links',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PersonalFeedInviteCreateIntegration', inviteFn),
      authorizer,
    });
    // GET /personal-feed/me/invite-links
    apiGateway.addRoutes({
      path: '/personal-feed/me/invite-links',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedInviteListIntegration', inviteFn),
      authorizer,
    });
    // DELETE /personal-feed/me/invite-links/{linkId}
    apiGateway.addRoutes({
      path: '/personal-feed/me/invite-links/{linkId}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('PersonalFeedInviteDeleteIntegration', inviteFn),
      authorizer,
    });
    // GET /personal-feed/invite/{token}
    apiGateway.addRoutes({
      path: '/personal-feed/invite/{token}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('PersonalFeedInviteResolveIntegration', inviteFn),
      authorizer,
    });
  }
}
