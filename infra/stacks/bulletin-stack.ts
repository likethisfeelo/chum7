/**
 * Bulletin Stack
 *
 * 챌린지 준비/진행 단계 게시판 API:
 *   POST   /bulletin/{challengeId}/posts                        - 글 작성
 *   GET    /bulletin/{challengeId}/posts?phase=preparing        - 글 목록
 *   POST   /bulletin/{challengeId}/posts/{postId}/like          - 좋아요 토글
 *   POST   /bulletin/{challengeId}/posts/{postId}/comments      - 댓글 작성
 *   GET    /bulletin/{challengeId}/posts/{postId}/comments      - 댓글 목록
 */
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

interface BulletinStackProps extends StackProps {
  stage: string;
  apiGateway: HttpApi;
  authorizer: HttpJwtAuthorizer;
  bulletinPostsTable: Table;
  bulletinCommentsTable: Table;
  bulletinLikesTable: Table;
  challengesTable: Table;
  userChallengesTable: Table;
  personalQuestProposalsTable?: Table;
  notificationsTable?: Table;
}

export class BulletinStack extends Stack {
  constructor(scope: Construct, id: string, props: BulletinStackProps) {
    super(scope, id, props);

    const {
      stage, apiGateway, authorizer,
      bulletinPostsTable, bulletinCommentsTable, bulletinLikesTable,
      challengesTable, userChallengesTable,
    } = props;

    const commonEnv = {
      STAGE: stage,
      BULLETIN_POSTS_TABLE: bulletinPostsTable.tableName,
      BULLETIN_COMMENTS_TABLE: bulletinCommentsTable.tableName,
      BULLETIN_LIKES_TABLE: bulletinLikesTable.tableName,
      CHALLENGES_TABLE: challengesTable.tableName,
      USER_CHALLENGES_TABLE: userChallengesTable.tableName,
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
    };

    // 1. Create Post
    const createPostFn = new NodejsFunction(this, 'CreatePostFn', {
      ...commonProps,
      functionName: `chme-${stage}-bulletin-create-post`,
      entry: path.join(__dirname, '../../backend/services/bulletin/create-post/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    bulletinPostsTable.grantWriteData(createPostFn);
    challengesTable.grantReadData(createPostFn);
    userChallengesTable.grantReadData(createPostFn);
    apiGateway.addRoutes({
      path: '/bulletin/{challengeId}/posts',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreatePostIntegration', createPostFn),
      authorizer,
    });

    // 2. List Posts (protected)
    const listPostsFn = new NodejsFunction(this, 'ListPostsFn', {
      ...commonProps,
      functionName: `chme-${stage}-bulletin-list-posts`,
      entry: path.join(__dirname, '../../backend/services/bulletin/list-posts/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    bulletinPostsTable.grantReadData(listPostsFn);
    apiGateway.addRoutes({
      path: '/bulletin/{challengeId}/posts',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListPostsIntegration', listPostsFn),
      authorizer,
    });

    // 3. Like Post (toggle) (protected)
    const likePostFn = new NodejsFunction(this, 'LikePostFn', {
      ...commonProps,
      functionName: `chme-${stage}-bulletin-like-post`,
      entry: path.join(__dirname, '../../backend/services/bulletin/like-post/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    bulletinPostsTable.grantReadWriteData(likePostFn);
    bulletinLikesTable.grantReadWriteData(likePostFn);
    apiGateway.addRoutes({
      path: '/bulletin/{challengeId}/posts/{postId}/like',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('LikePostIntegration', likePostFn),
      authorizer,
    });

    // 4. Create Comment (protected)
    const createCommentFn = new NodejsFunction(this, 'CreateCommentFn', {
      ...commonProps,
      functionName: `chme-${stage}-bulletin-create-comment`,
      entry: path.join(__dirname, '../../backend/services/bulletin/create-comment/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    bulletinPostsTable.grantReadWriteData(createCommentFn);
    bulletinCommentsTable.grantWriteData(createCommentFn);
    apiGateway.addRoutes({
      path: '/bulletin/{challengeId}/posts/{postId}/comments',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateCommentIntegration', createCommentFn),
      authorizer,
    });

    // 5. List Comments (protected)
    const listCommentsFn = new NodejsFunction(this, 'ListCommentsFn', {
      ...commonProps,
      functionName: `chme-${stage}-bulletin-list-comments`,
      entry: path.join(__dirname, '../../backend/services/bulletin/list-comments/index.ts'),
      handler: 'handler',
      environment: commonEnv,
    });
    bulletinCommentsTable.grantReadData(listCommentsFn);
    apiGateway.addRoutes({
      path: '/bulletin/{challengeId}/posts/{postId}/comments',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListCommentsIntegration', listCommentsFn),
      authorizer,
    });
  }
}
