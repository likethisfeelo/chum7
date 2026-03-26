import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

interface ChallengeBoardStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  challengesTable: Table;
  userChallengesTable: Table;
  challengeBoardsTable: Table;
  challengeCommentsTable: Table;
  challengePreviewsTable: Table;
  notificationsTable: Table;
  verificationCommentsTable: Table;
  verificationReactionsTable: Table;
}

export class ChallengeBoardStack extends Stack {
  constructor(scope: Construct, id: string, props: ChallengeBoardStackProps) {
    super(scope, id, props);

    const {
      stage,
      apiGateway,
      authorizer,
      challengesTable,
      userChallengesTable,
      challengeBoardsTable,
      challengeCommentsTable,
      challengePreviewsTable,
      notificationsTable,
      verificationCommentsTable,
      verificationReactionsTable,
    } = props;

    const commonEnv = {
      STAGE: stage,
      ANON_ID_SALT: process.env.ANON_ID_SALT ?? '',
      CHALLENGES_TABLE: challengesTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
      CHALLENGE_BOARDS_TABLE: challengeBoardsTable.tableName,
      CHALLENGE_COMMENTS_TABLE: challengeCommentsTable.tableName,
      CHALLENGE_PREVIEWS_TABLE: challengePreviewsTable.tableName,
      NOTIFICATIONS_TABLE: notificationsTable.tableName,
      VERIFICATION_COMMENTS_TABLE: verificationCommentsTable.tableName,
      VERIFICATION_REACTIONS_TABLE: verificationReactionsTable.tableName,
    };

    const commonProps = {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: stage === 'dev',
        externalModules: ['@aws-sdk/*'],
      },
      environment: commonEnv,
    };

    const getBoardFn = new NodejsFunction(this, 'GetChallengeBoardFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-board-get`,
      entry: path.join(__dirname, '../../backend/services/challenge-board/get-board/index.ts'),
      handler: 'handler',
    });
    challengeBoardsTable.grantReadData(getBoardFn);
    userChallengesTable.grantReadData(getBoardFn);
    challengesTable.grantReadData(getBoardFn);
    apiGateway.addRoutes({
      path: '/challenge-board/{challengeId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetChallengeBoardIntegration', getBoardFn),
      authorizer,
    });

    const upsertBoardFn = new NodejsFunction(this, 'UpsertChallengeBoardFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-board-upsert`,
      entry: path.join(__dirname, '../../backend/services/challenge-board/upsert-board/index.ts'),
      handler: 'handler',
    });
    challengeBoardsTable.grantReadWriteData(upsertBoardFn);
    challengesTable.grantReadData(upsertBoardFn);
    apiGateway.addRoutes({
      path: '/challenge-board/{challengeId}',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('UpsertChallengeBoardIntegration', upsertBoardFn),
      authorizer,
    });

    const submitCommentFn = new NodejsFunction(this, 'SubmitChallengeBoardCommentFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-board-submit-comment`,
      entry: path.join(__dirname, '../../backend/services/challenge-board/submit-comment/index.ts'),
      handler: 'handler',
    });
    challengeCommentsTable.grantWriteData(submitCommentFn);
    userChallengesTable.grantReadData(submitCommentFn);
    apiGateway.addRoutes({
      path: '/challenge-board/{challengeId}/comments',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SubmitChallengeBoardCommentIntegration', submitCommentFn),
      authorizer,
    });

    const getCommentsFn = new NodejsFunction(this, 'GetChallengeBoardCommentsFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-board-get-comments`,
      entry: path.join(__dirname, '../../backend/services/challenge-board/get-comments/index.ts'),
      handler: 'handler',
    });
    challengeCommentsTable.grantReadData(getCommentsFn);
    userChallengesTable.grantReadData(getCommentsFn);
    challengesTable.grantReadData(getCommentsFn);
    apiGateway.addRoutes({
      path: '/challenge-board/{challengeId}/comments',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetChallengeBoardCommentsIntegration', getCommentsFn),
      authorizer,
    });

    const quoteCommentFn = new NodejsFunction(this, 'QuoteChallengeBoardCommentFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-board-quote-comment`,
      entry: path.join(__dirname, '../../backend/services/challenge-board/quote-comment/index.ts'),
      handler: 'handler',
    });
    challengeBoardsTable.grantReadWriteData(quoteCommentFn);
    challengeCommentsTable.grantReadWriteData(quoteCommentFn);
    challengesTable.grantReadData(quoteCommentFn);
    apiGateway.addRoutes({
      path: '/challenge-board/{challengeId}/comments/{commentId}/quote',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('QuoteChallengeBoardCommentIntegration', quoteCommentFn),
      authorizer,
    });


    const reactCommentFn = new NodejsFunction(this, 'ReactChallengeBoardCommentFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-board-react-comment`,
      entry: path.join(__dirname, '../../backend/services/challenge-board/react-comment/index.ts'),
      handler: 'handler',
    });
    challengeCommentsTable.grantReadWriteData(reactCommentFn);
    userChallengesTable.grantReadData(reactCommentFn);
    apiGateway.addRoutes({
      path: '/challenge-board/{challengeId}/comments/{commentId}/react',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ReactChallengeBoardCommentIntegration', reactCommentFn),
      authorizer,
    });

    const leaderDmFn = new NodejsFunction(this, 'ChallengeFeedLeaderDmFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-feed-leader-dm`,
      entry: path.join(__dirname, '../../backend/services/challenge-board/leader-dm/index.ts'),
      handler: 'handler',
    });
    challengesTable.grantReadData(leaderDmFn);
    userChallengesTable.grantReadData(leaderDmFn);
    notificationsTable.grantReadWriteData(leaderDmFn);
    apiGateway.addRoutes({
      path: '/challenge-feed/{challengeId}/leader-dm',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ChallengeFeedLeaderDmIntegration', leaderDmFn),
      authorizer,
    });

    const getPreviewFn = new NodejsFunction(this, 'GetChallengePreviewFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-preview-get`,
      entry: path.join(__dirname, '../../backend/services/challenge-board/get-preview/index.ts'),
      handler: 'handler',
    });
    challengePreviewsTable.grantReadWriteData(getPreviewFn);
    challengesTable.grantReadData(getPreviewFn);
    apiGateway.addRoutes({
      path: '/preview-board/{challengeId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetChallengePreviewIntegration', getPreviewFn),
      // public read
    });

    apiGateway.addRoutes({
      path: '/challenge-preview/{challengeId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('LegacyGetChallengePreviewIntegration', getPreviewFn),
      // backward compatibility
    });

    const upsertPreviewFn = new NodejsFunction(this, 'UpsertChallengePreviewFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-preview-upsert`,
      entry: path.join(__dirname, '../../backend/services/challenge-board/upsert-preview/index.ts'),
      handler: 'handler',
    });
    challengePreviewsTable.grantReadWriteData(upsertPreviewFn);
    challengesTable.grantReadData(upsertPreviewFn);
    apiGateway.addRoutes({
      path: '/preview-board/{challengeId}',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('UpsertChallengePreviewIntegration', upsertPreviewFn),
      authorizer,
    });

    apiGateway.addRoutes({
      path: '/challenge-preview/{challengeId}',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('LegacyUpsertChallengePreviewIntegration', upsertPreviewFn),
      authorizer,
    });

    // ── 인증 피드 이모지 반응 ──────────────────────────────────────────
    const getVerifReactionsFn = new NodejsFunction(this, 'GetVerifReactionsFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-feed-get-reactions`,
      entry: path.join(__dirname, '../../backend/services/challenge-feed/get-verification-reactions/index.ts'),
      handler: 'handler',
    });
    verificationReactionsTable.grantReadData(getVerifReactionsFn);
    userChallengesTable.grantReadData(getVerifReactionsFn);
    apiGateway.addRoutes({
      path: '/challenge-feed/{challengeId}/verifications/{verificationId}/reactions',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetVerifReactionsIntegration', getVerifReactionsFn),
      authorizer,
    });

    const toggleVerifReactionFn = new NodejsFunction(this, 'ToggleVerifReactionFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-feed-toggle-reaction`,
      entry: path.join(__dirname, '../../backend/services/challenge-feed/toggle-verification-reaction/index.ts'),
      handler: 'handler',
    });
    verificationReactionsTable.grantReadWriteData(toggleVerifReactionFn);
    userChallengesTable.grantReadData(toggleVerifReactionFn);
    challengesTable.grantReadData(toggleVerifReactionFn);
    apiGateway.addRoutes({
      path: '/challenge-feed/{challengeId}/verifications/{verificationId}/reactions',
      methods: [HttpMethod.POST, HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('ToggleVerifReactionIntegration', toggleVerifReactionFn),
      authorizer,
    });

    // ── 인증 피드 댓글 ────────────────────────────────────────────────
    const getVerifCommentsFn = new NodejsFunction(this, 'GetVerifCommentsFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-feed-get-comments`,
      entry: path.join(__dirname, '../../backend/services/challenge-feed/get-verification-comments/index.ts'),
      handler: 'handler',
    });
    verificationCommentsTable.grantReadData(getVerifCommentsFn);
    userChallengesTable.grantReadData(getVerifCommentsFn);
    challengesTable.grantReadData(getVerifCommentsFn);
    apiGateway.addRoutes({
      path: '/challenge-feed/{challengeId}/verifications/{verificationId}/comments',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetVerifCommentsIntegration', getVerifCommentsFn),
      authorizer,
    });

    const submitVerifCommentFn = new NodejsFunction(this, 'SubmitVerifCommentFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-feed-submit-comment`,
      entry: path.join(__dirname, '../../backend/services/challenge-feed/submit-verification-comment/index.ts'),
      handler: 'handler',
    });
    verificationCommentsTable.grantWriteData(submitVerifCommentFn);
    userChallengesTable.grantReadData(submitVerifCommentFn);
    challengesTable.grantReadData(submitVerifCommentFn);
    apiGateway.addRoutes({
      path: '/challenge-feed/{challengeId}/verifications/{verificationId}/comments',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SubmitVerifCommentIntegration', submitVerifCommentFn),
      authorizer,
    });

    const deleteVerifCommentFn = new NodejsFunction(this, 'DeleteVerifCommentFn', {
      ...commonProps,
      functionName: `chme-${stage}-challenge-feed-delete-comment`,
      entry: path.join(__dirname, '../../backend/services/challenge-feed/delete-verification-comment/index.ts'),
      handler: 'handler',
    });
    verificationCommentsTable.grantReadWriteData(deleteVerifCommentFn);
    apiGateway.addRoutes({
      path: '/challenge-feed/{challengeId}/verifications/{verificationId}/comments/{commentId}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteVerifCommentIntegration', deleteVerifCommentFn),
      authorizer,
    });
  }
}
